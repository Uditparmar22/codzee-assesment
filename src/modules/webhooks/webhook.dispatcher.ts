import { createHmac } from 'node:crypto';
import type { Logger } from '../../lib/logger.js';
import { WebhookDeliveryModel, WebhookModel, type WebhookDocument } from './webhook.model.js';
import type { WebhookEvent } from './webhook.schemas.js';

export interface WebhookDispatcherOptions {
  logger: Logger;
  fetch?: typeof globalThis.fetch;
  /** Delay before each retry; the number of entries is the number of retries. */
  retryDelaysMs?: number[];
}

export interface WebhookDispatcher {
  /** Queues delivery of `event` to every active webhook of the project subscribed to it. */
  emit(projectId: string, event: WebhookEvent, data: unknown): Promise<void>;
  /** Resolves once every in-flight delivery has finished. Used by graceful shutdown and tests. */
  idle(): Promise<void>;
}

const DEFAULT_RETRY_DELAYS_MS = [1_000, 10_000, 60_000];

export function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createWebhookDispatcher({
  logger,
  fetch = globalThis.fetch,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
}: WebhookDispatcherOptions): WebhookDispatcher {
  const inFlight = new Set<Promise<void>>();

  const track = (job: Promise<void>): Promise<void> => {
    const tracked = job.finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
    return tracked;
  };

  async function deliver(webhook: WebhookDocument, event: WebhookEvent, data: unknown): Promise<void> {
    const delivery = await WebhookDeliveryModel.create({ webhookId: webhook._id, event });
    const payload = { id: delivery.id, event, createdAt: delivery.createdAt.toISOString(), data };
    const signature = signPayload(webhook.secret, JSON.stringify(payload));

    for (let attempt = 1; attempt <= retryDelaysMs.length + 1; attempt++) {
      delivery.attempts = attempt;
      try {
        const res = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'task-tracker-webhooks/1.0',
            'x-webhook-event': event,
            'x-webhook-delivery': delivery.id,
            'x-webhook-signature': signature,
          },
          body: JSON.stringify({ ...payload, attempt }),
        });
        delivery.lastStatusCode = res.status;
        delivery.lastError = null;
        if (res.ok) {
          delivery.status = 'succeeded';
          await delivery.save();
          return;
        }
      } catch (err) {
        delivery.lastStatusCode = null;
        delivery.lastError = err instanceof Error ? err.message : String(err);
      }

      const delay = retryDelaysMs[attempt - 1];
      if (delay === undefined) break;
      await delivery.save();
      await sleep(delay);
    }

    delivery.status = 'failed';
    await delivery.save();
    logger.warn('Webhook delivery failed', { webhookId: webhook.id, deliveryId: delivery.id, event });
  }

  return {
    emit(projectId, event, data) {
      return track(
        (async () => {
          const webhooks = await WebhookModel.find({ projectId, active: true, events: event });
          for (const webhook of webhooks) track(deliver(webhook, event, data));
        })(),
      );
    },

    async idle() {
      while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
    },
  };
}
