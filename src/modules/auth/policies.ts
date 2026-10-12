import type { Project } from '../projects/project.model.js';
import type { Task } from '../tasks/task.model.js';
import type { AuthUser } from './tokens.js';

/** Owners and admins can change a project and the set of tasks in it. */
export function canManageProject(user: AuthUser, project: Pick<Project, 'ownerId'>): boolean {
  return user.role === 'admin' || project.ownerId.toString() === user.id;
}

/** Anyone who can manage the project, plus the task's assignee, can edit a task. */
export function canEditTask(
  user: AuthUser,
  task: Pick<Task, 'assigneeId'>,
  project: Pick<Project, 'ownerId'>,
): boolean {
  return canManageProject(user, project) || task.assigneeId?.toString() === user.id;
}
