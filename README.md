# Task Tracker API

A REST API for tracking work across teams: **users** own **projects**, and projects contain **tasks** that can be assigned, prioritised and moved through a simple workflow.

Built with **Node.js, TypeScript, Express 5, MongoDB and Mongoose**, with request validation in **zod**. Tests spin up an in-memory MongoDB, so they need no external services.

## Quick start

```bash
nvm use            # Node 22 (see .nvmrc)
npm install
npm run db:up      # MongoDB 8 in Docker (or point MONGODB_URI at Atlas)
cp .env.example .env   # optional; defaults work out of the box
npm run dev        # http://localhost:3000, indexes are synced on startup
```

| Script              | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Start with hot reload (tsx)               |
| `npm run build`     | Compile to `dist/`                        |
| `npm start`         | Run the compiled server                   |
| `npm run db:up`     | Start a local MongoDB with Docker Compose |
| `npm test`          | Run the test suite (Vitest + Supertest + mongodb-memory-server) |
| `npm run typecheck` | Type-check without emitting               |

### Configuration

| Variable        | Default              | Description                                      |
| --------------- | -------------------- | ------------------------------------------------ |
| `PORT`          | `3000`               | HTTP port                                        |
| `MONGODB_URI`   | `mongodb://127.0.0.1:27017/task-tracker` | MongoDB connection string |
| `LOG_LEVEL`     | `info`               | `debug` \| `info` \| `warn` \| `error` \| `silent` |
| `NODE_ENV`      | `production`         | `development` \| `test` \| `production`. Unset is treated as production; `npm run dev` sets `development` |
| `JWT_SECRET`    | dev fallback outside production | HMAC secret for access tokens. **Required in production** (min. 32 chars); the server refuses to start without it |
| `JWT_EXPIRES_IN_SECONDS` | `3600`      | Access token lifetime                            |

## API

All request and response bodies are JSON. Fields use `camelCase`, ids are 24-character hex ObjectIds, and timestamps are ISO-8601 UTC.

### Authentication

Register or log in to receive a JWT, then send it on every other request:

```
Authorization: Bearer <token>
```

| Method | Path             | Description                                   |
| ------ | ---------------- | --------------------------------------------- |
| POST   | `/auth/register` | Create an account (`email`, `name`, `password`) → `{ user, token, expiresIn }` |
| POST   | `/auth/login`    | Exchange credentials for a token              |

Passwords are hashed with scrypt and a per-user random salt, and the hash is never returned by the API.

#### Authorization rules

| Action                               | Allowed for                            |
| ------------------------------------ | -------------------------------------- |
| Read users, projects, tasks          | Any authenticated user                 |
| Create a project                     | Any authenticated user (becomes owner) |
| Update / delete a project            | Project owner, admin                   |
| Create / delete tasks in a project   | Project owner, admin                   |
| Update a task                        | Project owner, admin, task assignee    |

### Users

| Method | Path         | Description            |
| ------ | ------------ | ---------------------- |
| GET    | `/users/me`  | The authenticated user |
| GET    | `/users/:id` | Get a user             |

### Projects

| Method | Path            | Description                                     |
| ------ | --------------- | ----------------------------------------------- |
| POST   | `/projects`     | Create a project (`name`, `description?`) owned by the caller |
| GET    | `/projects`     | List projects (filter: `?ownerId=`; paginated)  |
| GET    | `/projects/:id` | Get a project                                   |
| PATCH  | `/projects/:id` | Update `name` / `description`                   |
| DELETE | `/projects/:id` | Delete a project and its tasks                  |
| GET    | `/projects/:id/stats` | Task counts: `total`, `byStatus`, `overdue` |

### Tasks

| Method | Path                           | Description                                              |
| ------ | ------------------------------ | -------------------------------------------------------- |
| POST   | `/projects/:projectId/tasks`   | Create a task                                            |
| GET    | `/projects/:projectId/tasks`   | List tasks (see query params below; paginated)           |
| GET    | `/tasks/:id`                   | Get a task                                               |
| PATCH  | `/tasks/:id`                   | Partially update a task                                  |
| DELETE | `/tasks/:id`                   | Delete a task                                            |

Task fields: `title`, `description`, `status` (`todo` \| `in_progress` \| `done`), `priority` (`low` \| `medium` \| `high`), `assigneeId`, `dueDate` (send `YYYY-MM-DD`; returned as midnight UTC).

#### Listing tasks

| Param        | Description                                                  |
| ------------ | ------------------------------------------------------------ |
| `status`, `priority`, `assigneeId` | Exact-match filters                    |
| `q`          | Case-insensitive search in the title (matched literally, not as a regex) |
| `sort`       | `createdAt` (default) or `dueDate`                           |
| `include`    | `assignee` embeds `{ id, name, email }` of the assignee      |
| `limit`, `cursor` | Pagination (below)                                      |

### Webhooks

Project owners can register HTTPS endpoints that receive task events.

| Method | Path                                                 | Description                              |
| ------ | ---------------------------------------------------- | ---------------------------------------- |
| POST   | `/projects/:projectId/webhooks`                      | Register (`url`, `events?`) → includes the signing `secret` |
| GET    | `/projects/:projectId/webhooks`                      | List webhooks                            |
| DELETE | `/projects/:projectId/webhooks/:webhookId`           | Remove a webhook                         |
| GET    | `/projects/:projectId/webhooks/:webhookId/deliveries`| Last 50 delivery attempts                |

Events: `task.created`, `task.updated`, `task.deleted` (all by default). Each delivery is a `POST` with a JSON body:

```json
{ "id": "<delivery id>", "event": "task.created", "createdAt": "2026-10-12T09:00:00.000Z", "data": { ...task } }
```

and headers `X-Webhook-Event`, `X-Webhook-Delivery` and `X-Webhook-Signature: sha256=<hex>`. The signature is an HMAC-SHA256 of the raw request body using the webhook's secret; receivers should verify it with a constant-time comparison before trusting the payload.

Non-2xx responses and network errors are retried after 1s, 10s and 60s; the outcome of each delivery is recorded and visible in the deliveries endpoint.

### Pagination

List endpoints use cursor pagination. Pass `limit` (default 20, max 100) and, for the next page, the `cursor` returned by the previous one:

```json
{ "data": [ ... ], "page": { "limit": 20, "nextCursor": "eyJpZCI6IjZhY2M5NTQw..." } }
```

Cursors are opaque: they encode the position in the current sort order, so use them only with the same query parameters.

`nextCursor` is `null` on the last page.

### Example

```bash
TOKEN=$(curl -s -X POST localhost:3000/auth/register -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada","password":"correct horse battery"}' | jq -r .token)
AUTH="authorization: Bearer $TOKEN"

PROJECT_ID=$(curl -s -X POST localhost:3000/projects -H "$AUTH" -H 'content-type: application/json' \
  -d '{"name":"Apollo"}' | jq -r .id)

curl -X POST localhost:3000/projects/$PROJECT_ID/tasks -H "$AUTH" -H 'content-type: application/json' \
  -d '{"title":"Design the lander","priority":"high","dueDate":"2026-12-01"}'
```

### Errors

Errors share one shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [{ "path": "email", "message": "Invalid email address" }] } }
```

| Status | Code               | When                                   |
| ------ | ------------------ | -------------------------------------- |
| 400    | `VALIDATION_ERROR` | Invalid body, query or path parameter  |
| 400    | `INVALID_JSON`     | Malformed JSON body                    |
| 401    | `UNAUTHORIZED`     | Missing, invalid or expired token; bad credentials |
| 403    | `FORBIDDEN`        | Authenticated but not allowed          |
| 404    | `NOT_FOUND`        | Resource or route does not exist       |
| 409    | `CONFLICT`         | Unique index violation (e.g. duplicate email) |
| 500    | `INTERNAL_ERROR`   | Unexpected failure (details are logged, not returned) |

## Project structure

```
src/
  app.ts               Express app factory (used by the server and the tests)
  server.ts            Process entry point: config, DB connection, graceful shutdown
  config.ts            Environment parsing and validation
  db/                  Mongoose connection and shared JSON serialisation
  lib/                 Errors, validation helpers, structured logger
  middleware/          Error handling and request logging
  modules/<resource>/  Request schemas (zod), Mongoose model, routes (HTTP)
tests/                 API tests against mongodb-memory-server
```

## Roadmap

- Durable webhook queue (deliveries currently run in-process)
- Transactions for multi-document writes (requires a replica set)

## License

Apache-2.0
