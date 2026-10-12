import { Router } from 'express';
import { z } from 'zod';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { objectId, parse, parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/authenticate.js';
import { canManageProject } from '../auth/policies.js';
import { TaskModel } from '../tasks/task.model.js';
import { ProjectModel, type ProjectDocument } from './project.model.js';
import { createProjectSchema, updateProjectSchema } from './project.schemas.js';

const listQuerySchema = z.object({ ownerId: objectId.optional() });

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
    const query = parse(listQuerySchema, req.query);
    const filter = query.ownerId ? { ownerId: query.ownerId } : {};
    res.json({ data: await ProjectModel.find(filter).sort({ _id: 1 }) });
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
