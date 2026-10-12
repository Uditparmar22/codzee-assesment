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
| `NODE_ENV`      | `development`        | `development` \| `test` \| `production`          |

## API

All request and response bodies are JSON. Fields use `camelCase`, ids are 24-character hex ObjectIds, and timestamps are ISO-8601 UTC.

### Users

| Method | Path         | Description   |
| ------ | ------------ | ------------- |
| POST   | `/users`     | Create a user |
| GET    | `/users/:id` | Get a user    |

### Projects

| Method | Path            | Description                                     |
| ------ | --------------- | ----------------------------------------------- |
| POST   | `/projects`     | Create a project (`name`, `description?`, `ownerId`) |
| GET    | `/projects`     | List projects (filter: `?ownerId=`)             |
| GET    | `/projects/:id` | Get a project                                   |
| PATCH  | `/projects/:id` | Update `name` / `description`                   |
| DELETE | `/projects/:id` | Delete a project and its tasks                  |

### Tasks

| Method | Path                           | Description                                              |
| ------ | ------------------------------ | -------------------------------------------------------- |
| POST   | `/projects/:projectId/tasks`   | Create a task                                            |
| GET    | `/projects/:projectId/tasks`   | List tasks (filters: `?status=`, `?priority=`, `?assigneeId=`) |
| GET    | `/tasks/:id`                   | Get a task                                               |
| PATCH  | `/tasks/:id`                   | Partially update a task                                  |
| DELETE | `/tasks/:id`                   | Delete a task                                            |

Task fields: `title`, `description`, `status` (`todo` \| `in_progress` \| `done`), `priority` (`low` \| `medium` \| `high`), `assigneeId`, `dueDate` (send `YYYY-MM-DD`; returned as midnight UTC).

### Example

```bash
USER_ID=$(curl -s -X POST localhost:3000/users -H 'content-type: application/json' \
  -d '{"email":"ada@example.com","name":"Ada"}' | jq -r .id)

PROJECT_ID=$(curl -s -X POST localhost:3000/projects -H 'content-type: application/json' \
  -d "{\"name\":\"Apollo\",\"ownerId\":\"$USER_ID\"}" | jq -r .id)

curl -X POST localhost:3000/projects/$PROJECT_ID/tasks -H 'content-type: application/json' \
  -d "{\"title\":\"Design the lander\",\"priority\":\"high\",\"assigneeId\":\"$USER_ID\",\"dueDate\":\"2026-12-01\"}"
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

- Authentication and per-user authorization
- Pagination for list endpoints
- Outgoing webhooks for task events
- Transactions for multi-document writes (requires a replica set)

## License

Apache-2.0
