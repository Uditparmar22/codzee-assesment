import express, { type Express } from 'express';
import { isDatabaseConnected } from './db/connection.js';
import { createLogger, type Logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { projectRoutes } from './modules/projects/project.routes.js';
import { projectTaskRoutes, taskRoutes } from './modules/tasks/task.routes.js';
import { userRoutes } from './modules/users/user.routes.js';

export interface AppDeps {
  logger?: Logger;
}

/** Builds the Express app. Expects the mongoose connection to be opened by the caller. */
export function createApp({ logger = createLogger('silent') }: AppDeps = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger(logger));

  app.get('/health', (_req, res) => {
    const healthy = isDatabaseConnected();
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'unavailable' });
  });

  app.use('/users', userRoutes());
  app.use('/projects', projectRoutes());
  app.use('/projects/:projectId/tasks', projectTaskRoutes());
  app.use('/tasks', taskRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
