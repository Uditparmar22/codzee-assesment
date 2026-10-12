import { z } from 'zod';

export const ROLES = ['admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const registerSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
