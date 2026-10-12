import { beforeEach, describe, expect, it } from 'vitest';
import { as, createProject, createUser, type TestUser } from './helpers.js';

const names = (res: { body: { data: { name?: string; title?: string }[] } }) =>
  res.body.data.map((item) => item.name ?? item.title ?? '');

describe('pagination, search and sorting', () => {
  let owner: TestUser;
  let api: ReturnType<typeof as>;

  beforeEach(async () => {
    owner = await createUser('Owner');
    api = as(owner);
  });

  it('pages through projects with a cursor', async () => {
    for (const name of ['P1', 'P2', 'P3', 'P4', 'P5']) await createProject(owner, name);

    const first = await api.get('/projects?limit=2');
    expect(names(first)).toEqual(['P1', 'P2']);
    expect(first.body.page).toEqual({ limit: 2, nextCursor: expect.any(String) });

    const second = await api.get(`/projects?limit=2&cursor=${first.body.page.nextCursor}`);
    expect(names(second)).toEqual(['P3', 'P4']);

    const last = await api.get(`/projects?limit=2&cursor=${second.body.page.nextCursor}`);
    expect(names(last)).toEqual(['P5']);
    expect(last.body.page.nextCursor).toBeNull();
  });

  it('defaults to 20 items per page', async () => {
    const res = await api.get('/projects');
    expect(res.body.page).toEqual({ limit: 20, nextCursor: null });
  });

  it('rejects invalid pagination params', async () => {
    expect((await api.get('/projects?limit=0')).status).toBe(400);
    expect((await api.get('/projects?limit=abc')).status).toBe(400);
    expect((await api.get('/projects?cursor=nope')).status).toBe(400);
    expect((await api.get('/projects?limit=101')).status).toBe(400);
    expect((await api.get('/projects?limit=100')).status).toBe(200);
  });

  describe('project tasks', () => {
    let base: string;

    beforeEach(async () => {
      const project = await createProject(owner);
      base = `/projects/${project.id}/tasks`;
    });

    it('pages through tasks in creation order', async () => {
      for (const title of ['T1', 'T2', 'T3']) await api.post(base).send({ title });

      const first = await api.get(`${base}?limit=2`);
      expect(names(first)).toEqual(['T1', 'T2']);
      const second = await api.get(`${base}?limit=2&cursor=${first.body.page.nextCursor}`);
      expect(names(second)).toEqual(['T3']);
      expect(second.body.page.nextCursor).toBeNull();
    });

    it('searches titles case-insensitively', async () => {
      await api.post(base).send({ title: 'Build the Rocket' });
      await api.post(base).send({ title: 'Paint the hangar' });

      expect(names(await api.get(`${base}?q=rocket`))).toEqual(['Build the Rocket']);
      expect(names(await api.get(`${base}?q=THE`))).toEqual(['Build the Rocket', 'Paint the hangar']);
    });

    it('treats regex metacharacters in the search as literal text', async () => {
      await api.post(base).send({ title: 'Learn C++ (draft)' });
      await api.post(base).send({ title: 'Learn Cobol' });

      const plus = await api.get(`${base}?q=${encodeURIComponent('C++')}`);
      expect(plus.status).toBe(200);
      expect(names(plus)).toEqual(['Learn C++ (draft)']);
      expect(names(await api.get(`${base}?q=${encodeURIComponent('(draft)')}`))).toEqual(['Learn C++ (draft)']);
      expect((await api.get(`${base}?q=(`)).status).toBe(200);
      expect(names(await api.get(`${base}?q=.*`))).toEqual([]);
    });

    it('sorts by due date', async () => {
      await api.post(base).send({ title: 'Later', dueDate: '2026-12-31' });
      await api.post(base).send({ title: 'Sooner', dueDate: '2026-11-01' });
      await api.post(base).send({ title: 'Middle', dueDate: '2026-12-01' });

      expect(names(await api.get(`${base}?sort=dueDate`))).toEqual(['Sooner', 'Middle', 'Later']);
      expect((await api.get(`${base}?sort=priority`)).status).toBe(400);
    });

    it('pages by due date without skipping or repeating tasks', async () => {
      // Creation order deliberately differs from due-date order, with ties and missing dates.
      const tasks = [
        ['D', '2026-12-31'],
        ['NoDate1', null],
        ['A', '2026-11-01'],
        ['C', '2026-12-01'],
        ['NoDate2', null],
        ['B', '2026-12-01'],
      ] as const;
      for (const [title, dueDate] of tasks) await api.post(base).send({ title, dueDate });

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res = await api.get(`${base}?sort=dueDate&limit=2${cursor ? `&cursor=${cursor}` : ''}`);
        expect(res.status).toBe(200);
        seen.push(...names(res));
        cursor = res.body.page.nextCursor;
      } while (cursor);

      expect(seen).toEqual(['NoDate1', 'NoDate2', 'A', 'C', 'B', 'D']);
    });

    it('embeds the assignee when include=assignee', async () => {
      const assignee = await createUser('Assignee');
      await api.post(base).send({ title: 'Assigned', assigneeId: assignee.id });
      await api.post(base).send({ title: 'Unassigned' });

      await api.post(base).send({ title: 'Also assigned', assigneeId: assignee.id });

      const res = await api.get(`${base}?include=assignee`);
      expect(res.body.data[0].assignee).toEqual({ id: assignee.id, name: 'Assignee', email: assignee.email });
      expect(res.body.data[1].assignee).toBeNull();
      expect(res.body.data[2].assignee).toEqual(res.body.data[0].assignee);

      const without = await api.get(base);
      expect(without.body.data[0]).not.toHaveProperty('assignee');
    });
  });
});

describe('project stats', () => {
  it('returns zero counts for an empty project', async () => {
    const owner = await createUser();
    const project = await createProject(owner);

    const res = await as(owner).get(`/projects/${project.id}/stats`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, byStatus: { todo: 0, in_progress: 0, done: 0 }, overdue: 0 });
  });

  it('counts overdue tasks that are not done', async () => {
    const owner = await createUser();
    const project = await createProject(owner);
    const api = as(owner);
    const base = `/projects/${project.id}/tasks`;
    await api.post(base).send({ title: 'Late', dueDate: '2020-01-01' });
    await api.post(base).send({ title: 'Late but done', dueDate: '2020-01-01', status: 'done' });
    await api.post(base).send({ title: 'Future', dueDate: '2099-01-01' });
    await api.post(base).send({ title: 'No date' });

    const res = await api.get(`/projects/${project.id}/stats`);
    expect(res.body).toEqual({ total: 4, byStatus: { todo: 3, in_progress: 0, done: 1 }, overdue: 1 });
  });

  it('does not count a task due today as overdue', async () => {
    const owner = await createUser();
    const project = await createProject(owner);
    const today = new Date().toISOString().slice(0, 10);
    await as(owner).post(`/projects/${project.id}/tasks`).send({ title: 'Due today', dueDate: today });

    const res = await as(owner).get(`/projects/${project.id}/stats`);
    expect(res.body).toMatchObject({ total: 1, overdue: 0 });
  });

  it('returns 404 for a missing project', async () => {
    const owner = await createUser();
    await as(owner).get('/projects/000000000000000000000000/stats').expect(404);
  });
});
