import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { decodeCursor, paginationQuery, toPage } from '../../lib/pagination.js';
import { objectId, parse, parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/authenticate.js';
import { canManageProject } from '../auth/policies.js';
import { TaskModel } from '../tasks/task.model.js';
import { TASK_STATUSES, type TaskStatus } from '../tasks/task.schemas.js';
import { ProjectModel, type ProjectDocument } from './project.model.js';
import { createProjectSchema, updateProjectSchema } from './project.schemas.js';

const listQuerySchema = paginationQuery.extend({ ownerId: objectId.optional() });
const projectCursor = z.object({ id: objectId });

export interface ProjectStats {
  total: number;
  byStatus: Record<TaskStatus, number>;
  /** Tasks not yet done whose due date has passed. */
  overdue: number;
}

async function findProjectOrThrow(id: string): Promise<ProjectDocument> {
  const project = await ProjectModel.findById(id);
  if (!project) throw new NotFoundError('Project', id);
  return project;
}

export function projectRoutes(): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const user = currentUser(req);
    const input = parse(createProjectSchema, req.body);
    res.status(201).json(await ProjectModel.create({ ...input, ownerId: user.id }));
  });

  router.get('/', async (req, res) => {
    const { ownerId, cursor, limit } = parse(listQuerySchema, req.query);
    const filter = {
      ...(ownerId && { ownerId }),
      ...(cursor && { _id: { $gt: decodeCursor(cursor, projectCursor).id } }),
    };
    const docs = await ProjectModel.find(filter).sort({ _id: 1 }).limit(limit + 1);
    res.json(toPage(docs, limit, (last) => ({ id: last.id })));
  });

  router.get('/:id/stats', async (req, res) => {
    const id = parseId(req.params.id);
    await findProjectOrThrow(id);
    const startOfTodayUtc = new Date(new Date().setUTCHours(0, 0, 0, 0));

    const [counts, overdue] = await Promise.all([
      // Aggregation pipelines bypass Mongoose casting, so the id must be an ObjectId here.
      TaskModel.aggregate<{ _id: TaskStatus; count: number }>([
        { $match: { projectId: new Types.ObjectId(id) } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      // Due dates are calendar days stored as midnight UTC: a task is overdue once its day has passed.
      TaskModel.countDocuments({ projectId: id, status: { $ne: 'done' }, dueDate: { $lt: startOfTodayUtc } }),
    ]);

    const byStatus = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<TaskStatus, number>;
    for (const { _id, count } of counts) byStatus[_id] = count;

    const stats: ProjectStats = {
      total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
      byStatus,
      overdue,
    };
    res.json(stats);
  });

  router.get('/:id', async (req, res) => {
    res.json(await findProjectOrThrow(parseId(req.params.id)));
  });

  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const input = parse(updateProjectSchema, req.body);
    const project = await findProjectOrThrow(id);
    if (!canManageProject(currentUser(req), project)) throw new ForbiddenError();

    project.set(input);
    res.json(await project.save());
  });

  router.delete('/:id', async (req, res) => {
    const project = await findProjectOrThrow(parseId(req.params.id));
    if (!canManageProject(currentUser(req), project)) throw new ForbiddenError();

    await project.deleteOne();
    await TaskModel.deleteMany({ projectId: project._id });
    res.status(204).end();
  });

  return router;
}
