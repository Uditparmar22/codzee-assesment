import type { QueryFilter, SortOrder } from 'mongoose';
import { toPage, type Page } from '../../lib/pagination.js';
import { UserModel } from '../users/user.model.js';
import { TaskModel, type Task } from './task.model.js';
import type { ListTasksQuery } from './task.schemas.js';

export interface TaskAssigneeSummary {
  id: string;
  name: string;
  email: string;
}

export type TaskView = Record<string, unknown> & { id: string; assignee?: TaskAssigneeSummary | null };

/** Lists one project's tasks with filtering, title search, sorting and cursor pagination. */
export async function listProjectTasks(projectId: string, query: ListTasksQuery): Promise<Page<TaskView>> {
  const filter: QueryFilter<Task> = { projectId };
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.assigneeId) filter.assigneeId = query.assigneeId;
  if (query.q) filter.title = new RegExp(query.q, 'i');
  if (query.cursor) filter._id = { $gt: query.cursor };

  const sort: Record<string, SortOrder> = query.sort === 'dueDate' ? { dueDate: 1, _id: 1 } : { _id: 1 };
  const docs = await TaskModel.find(filter).sort(sort).limit(query.limit + 1);

  const tasks: TaskView[] = docs.map((doc) => doc.toJSON<TaskView>());
  if (query.include === 'assignee') {
    for (const task of tasks) {
      const assignee = task.assigneeId ? await UserModel.findById(task.assigneeId) : null;
      task.assignee = assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null;
    }
  }

  return toPage(tasks, query.limit);
}
