import type { ToObjectOptions } from 'mongoose';

/**
 * Shared `toJSON` options: expose `id` instead of `_id` and drop `__v`, so API responses never
 * leak storage details. ObjectId references serialise to hex strings and Dates to ISO-8601.
 */
export const toJSONOptions: ToObjectOptions = {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret._id;
    return ret;
  },
};
