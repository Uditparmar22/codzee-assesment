import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';

const DUPLICATE_KEY = 11000;

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
};

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        error: { code: err.code, message: err.message, details: err.details },
      });
      return;
    }

    // Malformed JSON bodies are surfaced by express.json() as a SyntaxError with status 400.
    if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
      return;
    }

    // A unique index rejected the write, e.g. two concurrent sign-ups with the same email.
    if (err instanceof mongoose.mongo.MongoServerError && err.code === DUPLICATE_KEY) {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Resource already exists' } });
      return;
    }

    if (err instanceof mongoose.Error.ValidationError) {
      const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details } });
      return;
    }

    logger.error('Unhandled error', {
      method: req.method,
      path: req.path,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : String(err),
    });
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  };
}
