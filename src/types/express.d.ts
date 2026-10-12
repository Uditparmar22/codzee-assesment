import type { AuthUser } from '../modules/auth/tokens.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware for authenticated requests. */
      user?: AuthUser;
    }
  }
}

export {};
