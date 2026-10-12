import express, { type Express } from 'express';
import { isDatabaseConnected } from './db/connection.js';
import { createLogger, type Logger } from './lib/logger.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import type { TokenService } from './modules/auth/tokens.js';
import { projectRoutes } from './modules/projects/project.routes.js';
import { projectTaskRoutes, taskRoutes } from './modules/tasks/task.routes.js';
import { userRoutes } from './modules/users/user.routes.js';

export interface AppDeps {
  tokens: TokenService;
  logger?: Logger;
}

/** Builds the Express app. Expects the mongoose connection to be opened by the caller. */
export function createApp({ tokens, logger = createLogger('silent') }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger(logger));

  app.get('/health', (_req, res) => {
    const healthy = isDatabaseConnected();
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'unavailable' });
  });

  app.use('/auth', authRoutes(tokens));

  // Everything below requires a valid bearer token.
  const requireAuth = authenticate(tokens);
  app.use('/users', requireAuth, userRoutes());
  app.use('/projects', requireAuth, projectRoutes());
  app.use('/projects/:projectId/tasks', requireAuth, projectTaskRoutes());
  app.use('/tasks', requireAuth, taskRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
