import { z } from 'zod';

export const WEBHOOK_EVENTS = ['task.created', 'task.updated', 'task.deleted'] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const createWebhookSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2000),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).default([...WEBHOOK_EVENTS]),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
