import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { toJSONOptions } from '../../db/json.js';

const userSchema = new Schema(
  {
    // Stored lowercased so the unique index is effectively case-insensitive.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;

export const UserModel = model('User', userSchema);
