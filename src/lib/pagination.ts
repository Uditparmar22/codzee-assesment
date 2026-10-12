import { z } from 'zod';
import { ValidationError } from './errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Cursor pagination query params shared by list endpoints. */
export const paginationQuery = z.object({
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  cursor: z.string().max(500).optional(),
});

export interface Page<T> {
  data: T[];
  page: { limit: number; nextCursor: string | null };
}

/**
 * Cursors are opaque base64url JSON holding the sort key of the last item on the page, so the next
 * page can continue from that exact position in whatever order the list is sorted.
 */
export function encodeCursor(position: unknown): string {
  return Buffer.from(JSON.stringify(position)).toString('base64url');
}

export function decodeCursor<T extends z.ZodType>(cursor: string, schema: T): z.infer<T> {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new ValidationError('Invalid cursor', [{ path: 'cursor', message: 'is malformed or expired' }]);
  }
}

/**
 * Builds a page from a query that fetched `limit + 1` documents. The extra document only signals
 * that another page exists; it is not returned.
 */
export function toPage<T>(docs: T[], limit: number, cursorOf: (last: T) => unknown): Page<T> {
  const hasMore = docs.length > limit;
  const data = hasMore ? docs.slice(0, limit) : docs;
  const last = data.at(-1);
  return { data, page: { limit, nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null } };
}
