import { beforeEach, describe, expect, it } from 'vitest';
import { MISSING_ID, as, createAdmin, createProject, createUser, type TestUser } from './helpers.js';

describe('projects API', () => {
  let owner: TestUser;
  beforeEach(async () => {
    owner = await createUser('Owner');
  });

  it('creates, lists, updates and deletes a project', async () => {
    const api = as(owner);

    const created = await api.post('/projects').send({ name: 'Apollo', description: 'Moon landing' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Apollo', description: 'Moon landing', ownerId: owner.id });

    const list = await api.get('/projects');
    expect(list.body.data).toHaveLength(1);

    const updated = await api.patch(`/projects/${created.body.id}`).send({ description: null });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Apollo', description: null });

    await api.delete(`/projects/${created.body.id}`).expect(204);
    await api.get(`/projects/${created.body.id}`).expect(404);
  });

  it('sets the owner from the token, ignoring ownerId in the body', async () => {
    const other = await createUser('Other');
    const res = await as(owner).post('/projects').send({ name: 'Mine', ownerId: other.id });
    expect(res.body.ownerId).toBe(owner.id);
  });

  it('filters projects by owner', async () => {
    const bob = await createUser('Bob');
    await createProject(owner, 'A1');
    await createProject(bob, 'B1');
    await createProject(owner, 'A2');

    const res = await as(bob).get(`/projects?ownerId=${owner.id}`);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['A1', 'A2']);
  });

  it('only lets the owner or an admin modify a project', async () => {
    const project = await createProject(owner);
    const stranger = await createUser('Stranger');

    const forbidden = await as(stranger).patch(`/projects/${project.id}`).send({ name: 'Hijacked' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
    await as(stranger).delete(`/projects/${project.id}`).expect(403);

    const admin = await createAdmin();
    await as(admin).patch(`/projects/${project.id}`).send({ name: 'Renamed' }).expect(200);
    await as(admin).delete(`/projects/${project.id}`).expect(204);
  });

  it('returns 404 rather than 403 for a missing project', async () => {
    await as(owner).patch(`/projects/${MISSING_ID}`).send({ name: 'X' }).expect(404);
  });

  it('rejects an empty update', async () => {
    const project = await createProject(owner);
    await as(owner).patch(`/projects/${project.id}`).send({}).expect(400);
  });

  it('deleting a project also deletes its tasks', async () => {
    const project = await createProject(owner);
    const api = as(owner);
    const task = await api.post(`/projects/${project.id}/tasks`).send({ title: 'Build rocket' });

    await api.delete(`/projects/${project.id}`).expect(204);
    await api.get(`/tasks/${task.body.id}`).expect(404);
  });
});
