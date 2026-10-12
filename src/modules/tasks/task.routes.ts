import { Router } from 'express';
import { ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { parse, parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/authenticate.js';
import { canEditTask, canManageProject } from '../auth/policies.js';
import { ProjectModel, type ProjectDocument } from '../projects/project.model.js';
import { UserModel } from '../users/user.model.js';
import { TaskModel, type TaskDocument } from './task.model.js';
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from './task.schemas.js';

async function assertAssigneeExists(assigneeId: string | null | undefined): Promise<void> {
  if (assigneeId != null && !(await UserModel.exists({ _id: assigneeId }))) {
    throw new ValidationError('Assignee does not exist', [
      { path: 'assigneeId', message: `user ${assigneeId} not found` },
    ]);
  }
}

async function findProjectOrThrow(id: string): Promise<ProjectDocument> {
  const project = await ProjectModel.findById(id);
  if (!project) throw new NotFoundError('Project', id);
  return project;
}

async function findTaskOrThrow(id: string): Promise<TaskDocument> {
  const task = await TaskModel.findById(id);
  if (!task) throw new NotFoundError('Task', id);
  return task;
}

/** Routes nested under a project: /projects/:projectId/tasks */
export function projectTaskRoutes(): Router {
  const router = Router({ mergeParams: true });

  const projectIdFrom = (params: unknown) =>
    parseId((params as Record<string, string>).projectId, 'projectId');

  router.get('/', async (req, res) => {
    const project = await findProjectOrThrow(projectIdFrom(req.params));
    const query = parse(listTasksQuerySchema, req.query);
    res.json({ data: await TaskModel.find({ projectId: project._id, ...query }).sort({ _id: 1 }) });
  });

  router.post('/', async (req, res) => {
    const project = await findProjectOrThrow(projectIdFrom(req.params));
    if (!canManageProject(currentUser(req), project)) throw new ForbiddenError();

    const input = parse(createTaskSchema, req.body);
    await assertAssigneeExists(input.assigneeId);
    res.status(201).json(await TaskModel.create({ ...input, projectId: project._id }));
  });

  return router;
}

/** Routes addressing a task directly: /tasks/:id */
export function taskRoutes(): Router {
  const router = Router();

  router.get('/:id', async (req, res) => {
    res.json(await findTaskOrThrow(parseId(req.params.id)));
  });

  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const input = parse(updateTaskSchema, req.body);
    const task = await findTaskOrThrow(id);
    const project = await findProjectOrThrow(task.projectId.toString());
    if (!canEditTask(currentUser(req), task, project)) throw new ForbiddenError();

    await assertAssigneeExists(input.assigneeId);
    task.set(input);
    res.json(await task.save());
  });

  router.delete('/:id', async (req, res) => {
    const task = await findTaskOrThrow(parseId(req.params.id));
    const project = await findProjectOrThrow(task.projectId.toString());
    if (!canManageProject(currentUser(req), project)) throw new ForbiddenError();

    await task.deleteOne();
    res.status(204).end();
  });

  return router;
}
