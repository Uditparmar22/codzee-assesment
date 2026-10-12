import type { ToObjectOptions } from 'mongoose';

/**
 * `toJSON` options that expose `id` instead of `_id`, drop `__v`, and remove any `hidden` fields,
 * so API responses never leak storage details or secrets. ObjectId references serialise to hex
 * strings and Dates to ISO-8601.
 */
export function toJSONHiding(...hidden: string[]): ToObjectOptions {
  return {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret._id;
      for (const field of hidden) delete ret[field];
      return ret;
    },
  };
}

export const toJSONOptions = toJSONHiding();
