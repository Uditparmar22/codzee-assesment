import request from 'supertest';
import { createApp } from '../src/app.js';

export const api = request(createApp());

/** A well-formed ObjectId that will never match a document. */
export const MISSING_ID = '000000000000000000000000';

let emailCounter = 0;

export async function createUser(name = 'Ada Lovelace') {
  emailCounter += 1;
  const res = await api.post('/users').send({ email: `user${emailCounter}@example.com`, name });
  if (res.status !== 201) throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; email: string; name: string };
}

export async function createProject(ownerId: string, name = 'Apollo') {
  const res = await api.post('/projects').send({ name, ownerId });
  if (res.status !== 201) throw new Error(`createProject failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; name: string; ownerId: string };
}
