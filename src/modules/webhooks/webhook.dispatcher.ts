import { createHmac } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Logger } from '../../lib/logger.js';
import { WebhookDeliveryModel, WebhookModel, type WebhookDocument } from './webhook.model.js';
import type { WebhookEvent } from './webhook.schemas.js';
import { assertPublicDestination, defaultLookup, type HostLookup } from './url-safety.js';

export interface WebhookDispatcherOptions {
  logger: Logger;
  fetch?: typeof globalThis.fetch;
  /** Resolves a hostname to its addresses; used to refuse internal destinations. */
  lookup?: HostLookup;
  /** Delay before each retry; the number of entries is the number of retries. */
  retryDelaysMs?: number[];
  /** Per-attempt request timeout. Kept below the server's 10s shutdown deadline. */
  requestTimeoutMs?: number;
}

export interface WebhookDispatcher {
  /**
   * Queues delivery of `event` to every active webhook of the project subscribed to it. Never
   * rejects: failures are logged and recorded on the delivery, so callers can fire and forget.
   */
  emit(projectId: string, event: WebhookEvent, data: unknown): Promise<void>;
  /** Resolves once every in-flight delivery has finished. */
  idle(): Promise<void>;
  /** Cancels pending retries (recording them as failed), then waits for in-flight work. */
  shutdown(): Promise<void>;
}

const DEFAULT_RETRY_DELAYS_MS = [1_000, 10_000, 60_000];
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;

export function signPayload(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createWebhookDispatcher({
  logger,
  fetch = globalThis.fetch,
  lookup = defaultLookup,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
}: WebhookDispatcherOptions): WebhookDispatcher {
  const inFlight = new Set<Promise<void>>();
  const shuttingDown = new AbortController();

  const track = (job: Promise<void>): void => {
    const tracked = job.finally(() => inFlight.delete(tracked));
    inFlight.add(tracked);
  };

  async function attemptDelivery(webhook: WebhookDocument, body: string, headers: Record<string, string>) {
    await assertPublicDestination(webhook.url, lookup);
    // Redirects are not followed: a 3xx could point the request at an internal address.
    return fetch(webhook.url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  }

  async function deliver(webhook: WebhookDocument, event: WebhookEvent, data: unknown): Promise<void> {
    const delivery = await WebhookDeliveryModel.create({ webhookId: webhook._id, event });
    const payload = { id: delivery.id, event, createdAt: delivery.createdAt.toISOString(), data };

    for (let attempt = 1; attempt <= retryDelaysMs.length + 1; attempt++) {
      // Sign exactly the bytes that are sent, so receivers can verify the raw body.
      const body = JSON.stringify({ ...payload, attempt });
      delivery.attempts = attempt;
      try {
        const res = await attemptDelivery(webhook, body, {
          'content-type': 'application/json',
          'user-agent': 'task-tracker-webhooks/1.0',
          'x-webhook-event': event,
          'x-webhook-delivery': delivery.id,
          'x-webhook-signature': signPayload(webhook.secret, body),
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
        delivery.lastError = errorMessage(err);
      }

      const delay = retryDelaysMs[attempt - 1];
      if (delay === undefined) break;
      await delivery.save();
      try {
        await sleep(delay, undefined, { signal: shuttingDown.signal });
      } catch {
        delivery.lastError = 'Server shut down before the next retry';
        break;
      }
    }

    delivery.status = 'failed';
    await delivery.save();
    logger.warn('Webhook delivery failed', { webhookId: webhook.id, deliveryId: delivery.id, event });
  }

  async function dispatch(projectId: string, event: WebhookEvent, data: unknown): Promise<void> {
    const webhooks = await WebhookModel.find({ projectId, active: true, events: event });
    for (const webhook of webhooks) {
      track(
        deliver(webhook, event, data).catch((err: unknown) => {
          logger.error('Webhook delivery crashed', { webhookId: webhook.id, event, error: errorMessage(err) });
        }),
      );
    }
  }

  const idle = async (): Promise<void> => {
    while (inFlight.size > 0) await Promise.allSettled([...inFlight]);
  };

  return {
    emit(projectId, event, data) {
      const job = dispatch(projectId, event, data).catch((err: unknown) => {
        logger.error('Webhook dispatch failed', { projectId, event, error: errorMessage(err) });
      });
      track(job);
      return job;
    },

    idle,

    async shutdown() {
      shuttingDown.abort();
      await idle();
    },
  };
}
