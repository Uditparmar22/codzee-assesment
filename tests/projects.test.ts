import { describe, expect, it } from 'vitest';
import { MISSING_ID, api, createProject, createUser } from './helpers.js';

describe('projects API', () => {
  it('creates, lists, updates and deletes a project', async () => {
    const owner = await createUser();

    const created = await api.post('/projects').send({ name: 'Apollo', description: 'Moon landing', ownerId: owner.id });
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

  it('filters projects by owner', async () => {
    const alice = await createUser('Alice');
    const bob = await createUser('Bob');
    await createProject(alice.id, 'A1');
    await createProject(bob.id, 'B1');
    await createProject(alice.id, 'A2');

    const res = await api.get(`/projects?ownerId=${alice.id}`);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['A1', 'A2']);
    expect((await api.get('/projects?ownerId=bogus')).status).toBe(400);
  });

  it('rejects a project whose owner does not exist', async () => {
    const res = await api.post('/projects').send({ name: 'Ghost', ownerId: MISSING_ID });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('ownerId');
  });

  it('rejects an empty update', async () => {
    const owner = await createUser();
    const project = await createProject(owner.id);
    await api.patch(`/projects/${project.id}`).send({}).expect(400);
  });

  it('deleting a project also deletes its tasks', async () => {
    const owner = await createUser();
    const project = await createProject(owner.id);
    const task = await api.post(`/projects/${project.id}/tasks`).send({ title: 'Build rocket' });

    await api.delete(`/projects/${project.id}`).expect(204);
    await api.get(`/tasks/${task.body.id}`).expect(404);
  });
});
