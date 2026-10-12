import { Router } from 'express';
import { ConflictError, NotFoundError } from '../../lib/errors.js';
import { parse, parseId } from '../../lib/validation.js';
import { UserModel } from './user.model.js';
import { createUserSchema } from './user.schemas.js';

export function userRoutes(): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = parse(createUserSchema, req.body);
    if (await UserModel.exists({ email: input.email.toLowerCase() })) {
      throw new ConflictError(`A user with email ${input.email} already exists`);
    }
    res.status(201).json(await UserModel.create(input));
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const user = await UserModel.findById(id);
    if (!user) throw new NotFoundError('User', id);
    res.json(user);
  });

  return router;
}
