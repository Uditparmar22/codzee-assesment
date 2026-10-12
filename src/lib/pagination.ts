import { z } from 'zod';
import { objectId } from './validation.js';

export const DEFAULT_PAGE_SIZE = 20;

/** Cursor pagination query params shared by list endpoints. */
export const paginationQuery = z.object({
  limit: z.coerce.number().int().positive().default(DEFAULT_PAGE_SIZE),
  cursor: objectId.optional(),
});

export interface Page<T> {
  data: T[];
  page: { limit: number; nextCursor: string | null };
}

/**
 * Builds a page from a query that fetched `limit + 1` documents. The extra document only signals
 * that another page exists; it is not returned.
 */
export function toPage<T extends { id: string }>(docs: T[], limit: number): Page<T> {
  const hasMore = docs.length > limit;
  const data = hasMore ? docs.slice(0, limit) : docs;
  return { data, page: { limit, nextCursor: hasMore ? (data.at(-1)?.id ?? null) : null } };
}
