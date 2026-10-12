import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/lib/logger.js';
import { createWebhookDispatcher, signPayload } from '../src/modules/webhooks/webhook.dispatcher.js';
import { WebhookDeliveryModel, WebhookModel } from '../src/modules/webhooks/webhook.model.js';
import {
  MISSING_ID,
  as,
  createProject,
  createUser,
  dns,
  fakeFetch,
  webhookServer,
  webhooks,
  type TestUser,
} from './helpers.js';

describe('webhooks API', () => {
  let owner: TestUser;
  let projectId: string;
  let api: ReturnType<typeof as>;

  beforeEach(async () => {
    webhookServer.reset();
    dns.reset();
    owner = await createUser('Owner');
    projectId = (await createProject(owner)).id;
    api = as(owner);
  });

  const register = async (body: Record<string, unknown> = {}) => {
    const res = await api.post(`/projects/${projectId}/webhooks`).send({ url: 'https://hooks.example.com/tasks', ...body });
    expect(res.status).toBe(201);
    return res.body as { id: string; url: string; events: string[]; secret: string };
  };

  describe('registration', () => {
    it('creates a webhook with a generated secret, subscribed to all events by default', async () => {
      const webhook = await register();
      expect(webhook).toMatchObject({
        url: 'https://hooks.example.com/tasks',
        events: ['task.created', 'task.updated', 'task.deleted'],
        active: true,
        projectId,
      });
      expect(webhook.secret).toMatch(/^[a-f\d]{64}$/);
    });

    it('validates the url and events', async () => {
      const base = `/projects/${projectId}/webhooks`;
      expect((await api.post(base).send({ url: 'not a url' })).status).toBe(400);
      expect((await api.post(base).send({ url: 'ftp://example.com/hook' })).status).toBe(400);
      expect((await api.post(base).send({ url: 'http://hooks.example.com/plain-http' })).status).toBe(400);
      expect((await api.post(base).send({ url: 'https://example.com', events: ['task.exploded'] })).status).toBe(400);
      expect((await api.post(base).send({ url: 'https://example.com', events: [] })).status).toBe(400);
    });

    it('only lets the project owner register or delete webhooks', async () => {
      const stranger = await createUser('Stranger');
      const webhook = await register();
      await as(stranger).post(`/projects/${projectId}/webhooks`).send({ url: 'https://evil.example.com' }).expect(403);
      await as(stranger).delete(`/projects/${projectId}/webhooks/${webhook.id}`).expect(403);
    });

    it('rejects internal and private destinations', async () => {
      const base = `/projects/${projectId}/webhooks`;
      for (const url of [
        'https://localhost/hook',
        'https://api.localhost/hook',
        'https://metadata.google.internal/computeMetadata/v1/',
        'https://127.0.0.1/hook',
        'https://169.254.169.254/latest/meta-data/',
        'https://10.1.2.3/hook',
        'https://172.16.0.1/hook',
        'https://192.168.1.10/hook',
        'https://[::1]/hook',
        'https://[::ffff:10.0.0.1]/hook',
        'https://[fd00::1]/hook',
      ]) {
        const res = await api.post(base).send({ url });
        expect(res.status, url).toBe(400);
      }
    });

    it('only lets the project owner list webhooks, and never returns the secret again', async () => {
      const webhook = await register();
      const stranger = await createUser('Stranger');
      await as(stranger).get(`/projects/${projectId}/webhooks`).expect(403);

      const list = await api.get(`/projects/${projectId}/webhooks`);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).not.toHaveProperty('secret');
      expect(webhook.secret).toMatch(/^[a-f\d]{64}$/);
    });

    it('lists and deletes webhooks', async () => {
      const webhook = await register();
      const list = await api.get(`/projects/${projectId}/webhooks`);
      expect(list.body.data.map((w: { id: string }) => w.id)).toEqual([webhook.id]);

      await api.delete(`/projects/${projectId}/webhooks/${webhook.id}`).expect(204);
      await api.delete(`/projects/${projectId}/webhooks/${webhook.id}`).expect(404);
      expect((await api.get(`/projects/${projectId}/webhooks`)).body.data).toEqual([]);
    });

    it('does not delete a webhook through another project', async () => {
      const webhook = await register();
      const otherProject = await createProject(owner, 'Other');
      await api.delete(`/projects/${otherProject.id}/webhooks/${webhook.id}`).expect(404);
    });
  });

  describe('delivery', () => {
    it('delivers task.created with event metadata and a signature', async () => {
      const webhook = await register();
      await api.post(`/projects/${projectId}/tasks`).send({ title: 'Ship webhooks' });
      await webhooks.idle();

      expect(webhookServer.calls).toHaveLength(1);
      const [call] = webhookServer.calls;
      expect(call!.url).toBe(webhook.url);
      expect(call!.headers).toMatchObject({
        'content-type': 'application/json',
        'x-webhook-event': 'task.created',
        'x-webhook-delivery': expect.stringMatching(/^[a-f\d]{24}$/),
        'x-webhook-signature': expect.stringMatching(/^sha256=[a-f\d]{64}$/),
      });
      const body = JSON.parse(call!.body);
      expect(body).toMatchObject({ event: 'task.created', data: { title: 'Ship webhooks', projectId } });
      expect(body.id).toBe(call!.headers['x-webhook-delivery']);
    });

    it('signs the exact body that is sent, on every attempt', async () => {
      const webhook = await register();
      let attempt = 0;
      webhookServer.respond = () => new Response(null, { status: ++attempt < 3 ? 500 : 200 });

      await api.post(`/projects/${projectId}/tasks`).send({ title: 'Verify me' });
      await webhooks.idle();

      expect(webhookServer.calls).toHaveLength(3);
      for (const call of webhookServer.calls) {
        expect(call.headers['x-webhook-signature']).toBe(signPayload(webhook.secret, call.body));
      }
      expect(webhookServer.calls.map((c) => JSON.parse(c.body).attempt)).toEqual([1, 2, 3]);
    });

    it('delivers task.updated and task.deleted', async () => {
      await register();
      const task = await api.post(`/projects/${projectId}/tasks`).send({ title: 'Lifecycle' });
      await api.patch(`/tasks/${task.body.id}`).send({ status: 'done' });
      await api.delete(`/tasks/${task.body.id}`);
      await webhooks.idle();

      const events = webhookServer.calls.map((c) => c.headers['x-webhook-event']);
      expect(events.sort()).toEqual(['task.created', 'task.deleted', 'task.updated']);
      const updated = webhookServer.calls.find((c) => c.headers['x-webhook-event'] === 'task.updated');
      expect(JSON.parse(updated!.body).data.status).toBe('done');
    });

    it('only sends subscribed events', async () => {
      await register({ events: ['task.deleted'] });
      const task = await api.post(`/projects/${projectId}/tasks`).send({ title: 'Quiet' });
      await webhooks.idle();
      expect(webhookServer.calls).toHaveLength(0);

      await api.delete(`/tasks/${task.body.id}`);
      await webhooks.idle();
      expect(webhookServer.calls.map((c) => c.headers['x-webhook-event'])).toEqual(['task.deleted']);
    });

    it('retries failed deliveries and records the outcome', async () => {
      const webhook = await register();
      let attempt = 0;
      webhookServer.respond = () => new Response(null, { status: ++attempt === 1 ? 500 : 200 });

      await api.post(`/projects/${projectId}/tasks`).send({ title: 'Flaky receiver' });
      await webhooks.idle();

      expect(webhookServer.calls).toHaveLength(2);
      const deliveries = await api.get(`/projects/${projectId}/webhooks/${webhook.id}/deliveries`);
      expect(deliveries.body.data).toEqual([
        expect.objectContaining({ event: 'task.created', status: 'succeeded', attempts: 2, lastStatusCode: 200 }),
      ]);
    });

    it('gives up after the last retry', async () => {
      const webhook = await register();
      webhookServer.respond = () => new Response(null, { status: 503 });

      await api.post(`/projects/${projectId}/tasks`).send({ title: 'Down receiver' });
      await webhooks.idle();

      expect(webhookServer.calls).toHaveLength(3);
      const [delivery] = await WebhookDeliveryModel.find({ webhookId: webhook.id }).lean();
      expect(delivery).toMatchObject({ status: 'failed', attempts: 3, lastStatusCode: 503 });
    });

    it('records network errors', async () => {
      const webhook = await register();
      webhookServer.respond = () => {
        throw new TypeError('fetch failed');
      };

      await api.post(`/projects/${projectId}/tasks`).send({ title: 'Unreachable' });
      await webhooks.idle();

      const [delivery] = await WebhookDeliveryModel.find({ webhookId: webhook.id }).lean();
      expect(delivery).toMatchObject({ status: 'failed', lastStatusCode: null, lastError: 'fetch failed' });
    });

    it('refuses to deliver when the hostname resolves to an internal address', async () => {
      const webhook = await register();
      dns.lookup = async () => ['10.0.0.5'];

      await api.post(`/projects/${projectId}/tasks`).send({ title: 'Rebinding' });
      await webhooks.idle();

      expect(webhookServer.calls).toHaveLength(0);
      const [delivery] = await WebhookDeliveryModel.find({ webhookId: webhook.id }).lean();
      expect(delivery).toMatchObject({ status: 'failed', lastError: expect.stringMatching(/blocked address/) });
    });

    it('does not follow redirects', async () => {
      const webhook = await register();
      webhookServer.respond = () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } });

      await api.post(`/projects/${projectId}/tasks`).send({ title: 'Redirected' });
      await webhooks.idle();

      expect(webhookServer.calls.every((c) => c.url === webhook.url)).toBe(true);
      const [delivery] = await WebhookDeliveryModel.find({ webhookId: webhook.id }).lean();
      expect(delivery).toMatchObject({ status: 'failed', lastStatusCode: 302 });
    });

    it('stops delivering after a webhook is deleted', async () => {
      const webhook = await register();
      await api.delete(`/projects/${projectId}/webhooks/${webhook.id}`).expect(204);
      await api.post(`/projects/${projectId}/tasks`).send({ title: 'Nobody listening' });
      await webhooks.idle();
      expect(webhookServer.calls).toHaveLength(0);
    });

    it('restricts delivery history to the project owner', async () => {
      const webhook = await register();
      const stranger = await createUser('Stranger');
      await as(stranger).get(`/projects/${projectId}/webhooks/${webhook.id}/deliveries`).expect(403);
      await api.get(`/projects/${projectId}/webhooks/${MISSING_ID}/deliveries`).expect(404);
    });
  });

  describe('dispatcher resilience', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('never rejects when the database fails, and the task write still succeeds', async () => {
      await register();
      vi.spyOn(WebhookModel, 'find').mockRejectedValue(new Error('database unavailable'));

      await expect(webhooks.emit(projectId, 'task.created', {})).resolves.toBeUndefined();
      await api.post(`/projects/${projectId}/tasks`).send({ title: 'Still saved' }).expect(201);
      await webhooks.idle();
    });

    it('times out receivers that never respond', async () => {
      const webhook = await register();
      const hanging: typeof fetch = (_input, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
      const dispatcher = createWebhookDispatcher({
        logger: createLogger('silent'),
        fetch: hanging,
        lookup: async () => ['93.184.216.34'],
        retryDelaysMs: [],
        requestTimeoutMs: 50,
      });

      await dispatcher.emit(projectId, 'task.created', {});
      await dispatcher.idle();

      const [delivery] = await WebhookDeliveryModel.find({ webhookId: webhook.id }).lean();
      expect(delivery).toMatchObject({ status: 'failed', lastStatusCode: null, lastError: expect.stringMatching(/timeout|aborted/i) });
    });

    it('cancels pending retries on shutdown and records them as failed', async () => {
      const webhook = await register();
      webhookServer.respond = () => new Response(null, { status: 500 });
      const dispatcher = createWebhookDispatcher({
        logger: createLogger('silent'),
        fetch: fakeFetch,
        lookup: async () => ['93.184.216.34'],
        retryDelaysMs: [60_000],
      });

      await dispatcher.emit(projectId, 'task.created', {});
      await vi.waitFor(() => expect(webhookServer.calls).toHaveLength(1));
      const started = Date.now();
      await dispatcher.shutdown();

      expect(Date.now() - started).toBeLessThan(5_000);
      const [delivery] = await WebhookDeliveryModel.find({ webhookId: webhook.id }).lean();
      expect(delivery).toMatchObject({ status: 'failed', attempts: 1, lastError: 'Server shut down before the next retry' });
    });
  });
});
