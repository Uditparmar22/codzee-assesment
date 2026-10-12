import { z } from 'zod';

/** Development-only fallback. Rejected in production so tokens can never be signed with a public value. */
export const DEV_JWT_SECRET = 'dev-secret-change-me';
const MIN_PRODUCTION_SECRET_LENGTH = 32;

const envSchema = z
  .object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/task-tracker'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  JWT_SECRET: z.string().min(1).default(DEV_JWT_SECRET),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(3600),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      (env.JWT_SECRET === DEV_JWT_SECRET || env.JWT_SECRET.length < MIN_PRODUCTION_SECRET_LENGTH)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: `must be set to a random value of at least ${MIN_PRODUCTION_SECRET_LENGTH} characters in production`,
      });
    }
  });

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}
