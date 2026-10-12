import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { toJSONOptions } from '../../db/json.js';
import { TASK_PRIORITIES, TASK_STATUSES } from './task.schemas.js';

const taskSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    status: { type: String, enum: TASK_STATUSES, default: 'todo', required: true },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium', required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    dueDate: { type: Date, default: null },
  },
  { timestamps: true, toJSON: toJSONOptions },
);

// Supports the project task list, which filters by project and optionally status.
taskSchema.index({ projectId: 1, status: 1 });
// Supports `sort=dueDate` on the project task list and the overdue count in project stats.
taskSchema.index({ projectId: 1, dueDate: 1, _id: 1 });

export type Task = InferSchemaType<typeof taskSchema>;
export type TaskDocument = HydratedDocument<Task>;

export const TaskModel = model('Task', taskSchema);
