import { Types, type QueryFilter, type SortOrder } from 'mongoose';
import { z } from 'zod';
import { decodeCursor, toPage, type Page } from '../../lib/pagination.js';
import { escapeRegExp } from '../../lib/regex.js';
import { objectId } from '../../lib/validation.js';
import { UserModel } from '../users/user.model.js';
import { TaskModel, type Task } from './task.model.js';
import type { ListTasksQuery } from './task.schemas.js';

export interface TaskAssigneeSummary {
  id: string;
  name: string;
  email: string;
}

/** A task as returned by `toJSON()`: ObjectIds and Dates become strings only when serialised. */
export type TaskView = Record<string, unknown> & {
  id: string;
  assigneeId: Types.ObjectId | null;
  dueDate: Date | null;
  assignee?: TaskAssigneeSummary | null;
};

/** Position of the last task on a page: its id, plus its due date when sorting by due date. */
const taskCursor = z.object({ id: objectId, dueDate: z.iso.datetime().nullable().optional() });

/**
 * Filter for "after the cursor" in `{ dueDate: 1, _id: 1 }` order. MongoDB sorts null due dates
 * first, so after a null we take the remaining nulls by id and then every dated task.
 */
function afterDueDateCursor(id: string, dueDate: string | null): QueryFilter<Task> {
  const _id = new Types.ObjectId(id);
  if (dueDate === null) {
    return { $or: [{ dueDate: null, _id: { $gt: _id } }, { dueDate: { $ne: null } }] };
  }
  const date = new Date(dueDate);
  return { $or: [{ dueDate: { $gt: date } }, { dueDate: date, _id: { $gt: _id } }] };
}

/** Fetches the assignees of all tasks on the page in a single query and embeds them. */
async function embedAssignees(tasks: TaskView[]): Promise<void> {
  const ids = [...new Set(tasks.flatMap((task) => (task.assigneeId ? [task.assigneeId.toString()] : [])))];
  const users = ids.length ? await UserModel.find({ _id: { $in: ids } }) : [];
  const byId = new Map(users.map((user) => [user.id, { id: user.id, name: user.name, email: user.email }]));
  for (const task of tasks) {
    task.assignee = task.assigneeId ? (byId.get(task.assigneeId.toString()) ?? null) : null;
  }
}

/** Lists one project's tasks with filtering, title search, sorting and cursor pagination. */
export async function listProjectTasks(projectId: string, query: ListTasksQuery): Promise<Page<TaskView>> {
  const byDueDate = query.sort === 'dueDate';
  const conditions: QueryFilter<Task>[] = [{ projectId }];
  if (query.status) conditions.push({ status: query.status });
  if (query.priority) conditions.push({ priority: query.priority });
  if (query.assigneeId) conditions.push({ assigneeId: query.assigneeId });
  if (query.q) conditions.push({ title: new RegExp(escapeRegExp(query.q), 'i') });
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, taskCursor);
    conditions.push(
      byDueDate ? afterDueDateCursor(cursor.id, cursor.dueDate ?? null) : { _id: { $gt: cursor.id } },
    );
  }

  const sort: Record<string, SortOrder> = byDueDate ? { dueDate: 1, _id: 1 } : { _id: 1 };
  const docs = await TaskModel.find({ $and: conditions }).sort(sort).limit(query.limit + 1);

  const tasks = docs.map((doc) => doc.toJSON<TaskView>());
  if (query.include === 'assignee') await embedAssignees(tasks);

  return toPage(tasks, query.limit, (last) =>
    byDueDate ? { id: last.id, dueDate: last.dueDate?.toISOString() ?? null } : { id: last.id },
  );
}
