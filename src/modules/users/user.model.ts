import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { toJSONHiding } from '../../db/json.js';
import { ROLES } from '../auth/auth.schemas.js';

const userSchema = new Schema(
  {
    // Stored lowercased so the unique index is effectively case-insensitive.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, default: 'member', required: true },
    // Excluded from queries unless explicitly selected with `+passwordHash`. Users created before
    // authentication existed have no hash and cannot log in until one is set.
    passwordHash: { type: String, select: false, default: null },
  },
  { timestamps: true, toJSON: toJSONHiding('passwordHash') },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model('User', userSchema);
