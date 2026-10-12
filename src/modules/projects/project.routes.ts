import { Router } from 'express';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { objectId, parse, parseId } from '../../lib/validation.js';
import { TaskModel } from '../tasks/task.model.js';
import { UserModel } from '../users/user.model.js';
import { ProjectModel } from './project.model.js';
import { createProjectSchema, updateProjectSchema } from './project.schemas.js';

const listQuerySchema = z.object({ ownerId: objectId.optional() });

export function projectRoutes(): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = parse(createProjectSchema, req.body);
    if (!(await UserModel.exists({ _id: input.ownerId }))) {
      throw new ValidationError('Owner does not exist', [
        { path: 'ownerId', message: `user ${input.ownerId} not found` },
      ]);
    }
    res.status(201).json(await ProjectModel.create(input));
  });

  router.get('/', async (req, res) => {
    const query = parse(listQuerySchema, req.query);
    const filter = query.ownerId ? { ownerId: query.ownerId } : {};
    res.json({ data: await ProjectModel.find(filter).sort({ _id: 1 }) });
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const project = await ProjectModel.findById(id);
    if (!project) throw new NotFoundError('Project', id);
    res.json(project);
  });

  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const input = parse(updateProjectSchema, req.body);
    const project = await ProjectModel.findByIdAndUpdate(
      id,
      { $set: input },
      { returnDocument: 'after', runValidators: true },
    );
    if (!project) throw new NotFoundError('Project', id);
    res.json(project);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const project = await ProjectModel.findByIdAndDelete(id);
    if (!project) throw new NotFoundError('Project', id);
    await TaskModel.deleteMany({ projectId: project._id });
    res.status(204).end();
  });

  return router;
}
