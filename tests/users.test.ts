import { describe, expect, it } from 'vitest';
import { MISSING_ID, api, as, createUser } from './helpers.js';

describe('users API', () => {
  it('fetches a user by id without exposing credentials', async () => {
    const viewer = await createUser('Viewer');
    const other = await createUser('Other');

    const res = await as(viewer).get(`/users/${other.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: other.id,
      email: other.email,
      name: 'Other',
      role: 'member',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('maps a unique-index violation from concurrent sign-ups to 409', async () => {
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        api.post('/auth/register').send({ email: 'race@example.com', name: 'Racer', password: 'long enough pw' }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it('returns 400 for a malformed id and 404 for a missing user', async () => {
    const viewer = await createUser();
    expect((await as(viewer).get('/users/abc')).status).toBe(400);
    expect((await as(viewer).get(`/users/${MISSING_ID}`)).status).toBe(404);
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await api.post('/auth/register').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
