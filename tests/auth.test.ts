import { describe, expect, it } from 'vitest';
import { createTokenService } from '../src/modules/auth/tokens.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { TEST_PASSWORD, TEST_SECRET, api, as, createUser } from './helpers.js';

describe('auth API', () => {
  it('registers a user and returns a usable token', async () => {
    const res = await api
      .post('/auth/register')
      .send({ email: 'grace@example.com', name: 'Grace Hopper', password: TEST_PASSWORD });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'grace@example.com', name: 'Grace Hopper', role: 'member' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(res.body).toMatchObject({ token: expect.any(String), expiresIn: 3600 });

    const me = await as(res.body).get('/users/me');
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('grace@example.com');
  });

  it('stores a salted hash, never the plain password', async () => {
    const user = await createUser();
    const stored = await UserModel.findById(user.id).select('+passwordHash').lean();
    expect(stored?.passwordHash).toMatch(/^scrypt\$[a-f\d]{32}\$[a-f\d]{128}$/);
    expect(stored?.passwordHash).not.toContain(TEST_PASSWORD);
  });

  it('rejects duplicate emails case-insensitively', async () => {
    const user = await createUser();
    const res = await api
      .post('/auth/register')
      .send({ email: user.email.toUpperCase(), name: 'Dup', password: TEST_PASSWORD });
    expect(res.status).toBe(409);
  });

  it('validates registration input', async () => {
    const res = await api.post('/auth/register').send({ email: 'nope', name: '', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['email', 'name', 'password']);
  });

  it('logs in with valid credentials, case-insensitively on email', async () => {
    const user = await createUser();
    const res = await api.post('/auth/login').send({ email: user.email.toUpperCase(), password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    await as(res.body).get('/users/me').expect(200);
  });

  it('rejects a wrong password', async () => {
    const user = await createUser();
    const res = await api.post('/auth/login').send({ email: user.email, password: 'wrong password' });
    expect(res.status).toBe(401);
  });

  it('rejects users without a password set', async () => {
    await UserModel.create({ email: 'legacy@example.com', name: 'Legacy' });
    const res = await api.post('/auth/login').send({ email: 'legacy@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
  });

  it('requires a valid token on protected routes', async () => {
    expect((await api.get('/projects')).status).toBe(401);
    expect((await api.get('/projects').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);

    const user = await createUser();
    const forged = createTokenService('some-other-secret', 3600).sign({ id: user.id, role: 'admin' }).token;
    expect((await api.get('/projects').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  it('rejects expired tokens', async () => {
    const user = await createUser();
    const expired = createTokenService(TEST_SECRET, -10).sign({ id: user.id, role: 'member' }).token;
    expect((await api.get('/users/me').set('Authorization', `Bearer ${expired}`)).status).toBe(401);
  });
});
