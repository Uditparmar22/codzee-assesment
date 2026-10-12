import { Router } from 'express';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { parse, parseId } from '../../lib/validation.js';
import { ProjectModel } from '../projects/project.model.js';
import { UserModel } from '../users/user.model.js';
import { TaskModel } from './task.model.js';
import { createTaskSchema, listTasksQuerySchema, updateTaskSchema } from './task.schemas.js';

async function assertAssigneeExists(assigneeId: string | null | undefined): Promise<void> {
  if (assigneeId != null && !(await UserModel.exists({ _id: assigneeId }))) {
    throw new ValidationError('Assignee does not exist', [
      { path: 'assigneeId', message: `user ${assigneeId} not found` },
    ]);
  }
}

/** Routes nested under a project: /projects/:projectId/tasks */
export function projectTaskRoutes(): Router {
  const router = Router({ mergeParams: true });

  const requireProject = async (raw: unknown): Promise<string> => {
    const projectId = parseId(raw, 'projectId');
    if (!(await ProjectModel.exists({ _id: projectId }))) throw new NotFoundError('Project', projectId);
    return projectId;
  };

  router.get('/', async (req, res) => {
    const projectId = await requireProject((req.params as Record<string, string>).projectId);
    const query = parse(listTasksQuerySchema, req.query);
    res.json({ data: await TaskModel.find({ projectId, ...query }).sort({ _id: 1 }) });
  });

  router.post('/', async (req, res) => {
    const projectId = await requireProject((req.params as Record<string, string>).projectId);
    const input = parse(createTaskSchema, req.body);
    await assertAssigneeExists(input.assigneeId);
    res.status(201).json(await TaskModel.create({ ...input, projectId }));
  });

  return router;
}

/** Routes addressing a task directly: /tasks/:id */
export function taskRoutes(): Router {
  const router = Router();

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const task = await TaskModel.findById(id);
    if (!task) throw new NotFoundError('Task', id);
    res.json(task);
  });

  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const input = parse(updateTaskSchema, req.body);
    await assertAssigneeExists(input.assigneeId);
    const task = await TaskModel.findByIdAndUpdate(
      id,
      { $set: input },
      { returnDocument: 'after', runValidators: true },
    );
    if (!task) throw new NotFoundError('Task', id);
    res.json(task);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await TaskModel.findByIdAndDelete(id))) throw new NotFoundError('Task', id);
    res.status(204).end();
  });

  return router;
}
