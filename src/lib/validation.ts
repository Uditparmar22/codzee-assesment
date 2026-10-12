import { z } from 'zod';
import { ValidationError } from './errors.js';

/** Parses `input` with `schema`, throwing a ValidationError with field-level details on failure. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError('Request validation failed', details);
  }
  return result.data;
}

/** A 24-character hex MongoDB ObjectId. */
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid id');

export function parseId(raw: unknown, name = 'id'): string {
  const result = objectId.safeParse(raw);
  if (!result.success) {
    throw new ValidationError(`Invalid ${name}`, [{ path: name, message: 'must be a valid id' }]);
  }
  return result.data;
}
