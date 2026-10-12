import type { Request, RequestHandler } from 'express';
import { UnauthorizedError } from '../lib/errors.js';
import type { AuthUser, TokenService } from '../modules/auth/tokens.js';

/** Requires a valid `Authorization: Bearer <token>` header and attaches the caller to `req.user`. */
export function authenticate(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const header = req.get('authorization');
    const match = header?.match(/^Bearer\s+(\S+)$/i);
    const user = match?.[1] ? tokens.verify(match[1]) : undefined;
    if (!user) throw new UnauthorizedError();
    req.user = user;
    next();
  };
}

/** Returns the authenticated user. Only valid on routes mounted behind `authenticate`. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
