import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(100),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
