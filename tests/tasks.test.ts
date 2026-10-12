import { beforeEach, describe, expect, it } from 'vitest';
import { MISSING_ID, api, createProject, createUser } from './helpers.js';

describe('tasks API', () => {
  let ownerId: string;
  let projectId: string;

  beforeEach(async () => {
    ownerId = (await createUser()).id;
    projectId = (await createProject(ownerId)).id;
  });

  it('creates a task with defaults', async () => {
    const res = await api.post(`/projects/${projectId}/tasks`).send({ title: 'Write spec' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      projectId,
      title: 'Write spec',
      status: 'todo',
      priority: 'medium',
      assigneeId: null,
      dueDate: null,
    });
  });

  it('stores due dates as midnight UTC', async () => {
    const res = await api.post(`/projects/${projectId}/tasks`).send({ title: 'Launch', dueDate: '2026-12-01' });
    expect(res.body.dueDate).toBe('2026-12-01T00:00:00.000Z');
  });

  it('returns 404 when creating a task in a missing project', async () => {
    await api.post(`/projects/${MISSING_ID}/tasks`).send({ title: 'Orphan' }).expect(404);
  });

  it('rejects an unknown assignee and invalid values', async () => {
    const base = `/projects/${projectId}/tasks`;
    expect((await api.post(base).send({ title: 'X', assigneeId: MISSING_ID })).status).toBe(400);
    expect((await api.post(base).send({ title: 'X', status: 'blocked' })).status).toBe(400);
    expect((await api.post(base).send({ title: 'X', dueDate: '2026-13-01' })).status).toBe(400);
  });

  it('filters tasks by status, priority and assignee', async () => {
    const assignee = await createUser('Assignee');
    const base = `/projects/${projectId}/tasks`;
    await api.post(base).send({ title: 'A', status: 'done', priority: 'high' });
    await api.post(base).send({ title: 'B', status: 'todo', priority: 'high', assigneeId: assignee.id });
    await api.post(base).send({ title: 'C', status: 'todo', priority: 'low' });

    const titles = async (qs: string) =>
      (await api.get(`${base}?${qs}`)).body.data.map((t: { title: string }) => t.title);

    expect(await titles('')).toEqual(['A', 'B', 'C']);
    expect(await titles('status=todo')).toEqual(['B', 'C']);
    expect(await titles('status=todo&priority=high')).toEqual(['B']);
    expect(await titles(`assigneeId=${assignee.id}`)).toEqual(['B']);
    expect((await api.get(`${base}?status=nope`)).status).toBe(400);
  });

  it('never passes query operators from the query string to MongoDB', async () => {
    await api.post(`/projects/${projectId}/tasks`).send({ title: 'Done', status: 'done' });
    const res = await api.get(`/projects/${projectId}/tasks?status[$ne]=done`);
    // Express 5's simple query parser keeps `status[$ne]` as a literal key, which zod strips.
    expect(res.status).toBe(200);
    expect(res.body.data.map((t: { title: string }) => t.title)).toEqual(['Done']);
  });

  it('partially updates a task and bumps updatedAt', async () => {
    const created = await api
      .post(`/projects/${projectId}/tasks`)
      .send({ title: 'Ship it', description: 'v1', assigneeId: ownerId });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const res = await api.patch(`/tasks/${created.body.id}`).send({ status: 'in_progress', assigneeId: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Ship it', description: 'v1', status: 'in_progress', assigneeId: null });
    expect(res.body.updatedAt > created.body.updatedAt).toBe(true);
  });

  it('ignores unknown fields on update', async () => {
    const created = await api.post(`/projects/${projectId}/tasks`).send({ title: 'Safe' });
    const res = await api.patch(`/tasks/${created.body.id}`).send({ title: 'Safer', projectId: MISSING_ID });
    expect(res.status).toBe(200);
    expect(res.body.projectId).toBe(projectId);
  });

  it('deletes a task', async () => {
    const created = await api.post(`/projects/${projectId}/tasks`).send({ title: 'Temp' });
    await api.delete(`/tasks/${created.body.id}`).expect(204);
    await api.delete(`/tasks/${created.body.id}`).expect(404);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await api.get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
