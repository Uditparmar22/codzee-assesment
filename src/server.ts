import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { createLogger } from './lib/logger.js';
import { createTokenService } from './modules/auth/tokens.js';
import { createWebhookDispatcher } from './modules/webhooks/webhook.dispatcher.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

await connectDatabase(config.MONGODB_URI);
logger.info('Connected to MongoDB');

const tokens = createTokenService(config.JWT_SECRET, config.JWT_EXPIRES_IN_SECONDS);

const webhooks = createWebhookDispatcher({ logger });

const server = createApp({ tokens, webhooks, logger }).listen(config.PORT, () => {
  logger.info('Server listening', { port: config.PORT, env: config.NODE_ENV });
});

function shutdown(signal: string): void {
  logger.info('Shutting down', { signal });
  server.close(async () => {
    await webhooks.idle();
    await disconnectDatabase();
    process.exit(0);
  });
  // Force exit if open connections keep the server alive.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
