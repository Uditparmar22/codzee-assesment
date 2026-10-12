import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTokenService } from '../src/modules/auth/tokens.js';
import { UserModel } from '../src/modules/users/user.model.js';
import { createWebhookDispatcher } from '../src/modules/webhooks/webhook.dispatcher.js';
import { createLogger } from '../src/lib/logger.js';

export interface RecordedWebhookCall {
  url: string;
  headers: Record<string, string>;
  body: string;
  redirect: RequestInit['redirect'];
  hasTimeout: boolean;
}

/** Outgoing webhook requests captured by the fake fetch, and how it should respond. */
export const webhookServer = {
  calls: [] as RecordedWebhookCall[],
  respond: (_call: RecordedWebhookCall): Response | Promise<Response> => new Response(null, { status: 200 }),
  reset() {
    this.calls = [];
    this.respond = () => new Response(null, { status: 200 });
  },
};

const fakeFetch: typeof fetch = async (input, init) => {
  const call = {
    url: String(input),
    headers: Object.fromEntries(new Headers(init?.headers).entries()),
    body: String(init?.body),
    redirect: init?.redirect,
    hasTimeout: init?.signal instanceof AbortSignal,
  };
  webhookServer.calls.push(call);
  return webhookServer.respond(call);
};

export const TEST_SECRET = 'test-secret';
export const tokens = createTokenService(TEST_SECRET, 3600);
/** Every test hostname resolves to a public documentation address unless a test overrides it. */
export const dns = {
  lookup: async (_hostname: string): Promise<string[]> => ['93.184.216.34'],
  reset() {
    this.lookup = async () => ['93.184.216.34'];
  },
};

export const webhooks = createWebhookDispatcher({
  logger: createLogger('silent'),
  fetch: fakeFetch,
  lookup: (hostname) => dns.lookup(hostname),
  retryDelaysMs: [0, 0],
});

export { fakeFetch };
export const api = request(createApp({ tokens, webhooks }));

/** A well-formed ObjectId that will never match a document. */
export const MISSING_ID = '000000000000000000000000';

export const TEST_PASSWORD = 'correct horse battery';

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'member';
  token: string;
}

/** Returns request builders that send the given user's bearer token. */
export function as(user: Pick<TestUser, 'token'>) {
  const auth = { Authorization: `Bearer ${user.token}` };
  return {
    get: (url: string) => api.get(url).set(auth),
    post: (url: string) => api.post(url).set(auth),
    patch: (url: string) => api.patch(url).set(auth),
    delete: (url: string) => api.delete(url).set(auth),
  };
}

let emailCounter = 0;

export async function createUser(name = 'Ada Lovelace'): Promise<TestUser> {
  emailCounter += 1;
  const res = await api
    .post('/auth/register')
    .send({ email: `user${emailCounter}@example.com`, name, password: TEST_PASSWORD });
  if (res.status !== 201) throw new Error(`createUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...res.body.user, token: res.body.token };
}

/** Creates an admin directly in the database (admins are provisioned, not self-registered). */
export async function createAdmin(): Promise<TestUser> {
  emailCounter += 1;
  const user = await UserModel.create({ email: `admin${emailCounter}@example.com`, name: 'Admin', role: 'admin' });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'admin',
    token: tokens.sign({ id: user.id, role: 'admin' }).token,
  };
}

export async function createProject(owner: TestUser, name = 'Apollo') {
  const res = await as(owner).post('/projects').send({ name });
  if (res.status !== 201) throw new Error(`createProject failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; name: string; ownerId: string };
}
