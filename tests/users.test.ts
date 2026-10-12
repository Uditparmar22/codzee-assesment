import { describe, expect, it } from 'vitest';
import { MISSING_ID, api } from './helpers.js';

describe('users API', () => {
  it('creates and fetches a user', async () => {
    const created = await api.post('/users').send({ email: 'grace@example.com', name: 'Grace Hopper' });
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.stringMatching(/^[a-f\d]{24}$/),
      email: 'grace@example.com',
      name: 'Grace Hopper',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const fetched = await api.get(`/users/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(created.body);
  });

  it('rejects duplicate emails case-insensitively', async () => {
    await api.post('/users').send({ email: 'linus@example.com', name: 'Linus' }).expect(201);
    const res = await api.post('/users').send({ email: 'LINUS@example.com', name: 'Linus 2' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('maps a unique-index violation from concurrent writes to 409', async () => {
    const results = await Promise.all(
      [1, 2, 3].map(() => api.post('/users').send({ email: 'race@example.com', name: 'Racer' })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it('validates the request body', async () => {
    const res = await api.post('/users').send({ email: 'not-an-email', name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'name']);
  });

  it('returns 400 for a malformed id and 404 for a missing user', async () => {
    expect((await api.get('/users/abc')).status).toBe(400);
    expect((await api.get(`/users/${MISSING_ID}`)).status).toBe(404);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await api.post('/users').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
