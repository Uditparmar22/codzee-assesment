import { Router } from 'express';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import { parse } from '../../lib/validation.js';
import { UserModel, type UserDocument } from '../users/user.model.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import { hashPassword, verifyPassword } from './password.js';
import type { TokenService } from './tokens.js';

export function authRoutes(tokens: TokenService): Router {
  const router = Router();

  const issue = (user: UserDocument) => ({ user, ...tokens.sign({ id: user.id, role: user.role }) });

  router.post('/register', async (req, res) => {
    const input = parse(registerSchema, req.body);
    if (await UserModel.exists({ email: input.email.toLowerCase() })) {
      throw new ConflictError(`A user with email ${input.email} already exists`);
    }

    const user = await UserModel.create({
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    });
    res.status(201).json(issue(user));
  });

  router.post('/login', async (req, res) => {
    const { email, password } = parse(loginSchema, req.body);

    const user = await UserModel.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) throw new NotFoundError('User', email);
    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedError('Incorrect password');
    }

    res.json(issue(user));
  });

  return router;
}
