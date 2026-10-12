import jwt from 'jsonwebtoken';
import { objectId } from '../../lib/validation.js';
import type { Role } from './auth.schemas.js';

export interface AuthUser {
  id: string;
  role: Role;
}

export interface TokenService {
  sign(user: AuthUser): { token: string; expiresIn: number };
  verify(token: string): AuthUser | undefined;
}

export function createTokenService(secret: string, expiresInSeconds: number): TokenService {
  return {
    sign(user) {
      const token = jwt.sign({ role: user.role }, secret, {
        algorithm: 'HS256',
        subject: user.id,
        expiresIn: expiresInSeconds,
      });
      return { token, expiresIn: expiresInSeconds };
    },

    verify(token) {
      try {
        const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
        if (typeof payload === 'string' || !objectId.safeParse(payload.sub).success) return undefined;
        return { id: payload.sub!, role: payload.role === 'admin' ? 'admin' : 'member' };
      } catch {
        return undefined;
      }
    },
  };
}
