import { Router } from 'express';
import { NotFoundError } from '../../lib/errors.js';
import { parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/authenticate.js';
import { UserModel } from './user.model.js';

export function userRoutes(): Router {
  const router = Router();

  router.get('/me', async (req, res) => {
    const { id } = currentUser(req);
    const user = await UserModel.findById(id);
    if (!user) throw new NotFoundError('User', id);
    res.json(user);
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const user = await UserModel.findById(id);
    if (!user) throw new NotFoundError('User', id);
    res.json(user);
  });

  return router;
}
