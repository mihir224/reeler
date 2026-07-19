# Reeler - Reliable Event Delivery Platform

Reeler is a monorepo for an API-first webhook delivery platform. It provides durable event ingestion, endpoint fan-out, asynchronous delivery, retry handling, failed-delivery replay, HMAC-signed webhook requests, and delivery observability.

The core platform is built around a simple reliability contract:

> Durably ingest events and retry delivery until success or explicit failure.

## Monorepo Structure

```text
.
├── server/           # Fastify + PostgreSQL event delivery platform
├── dummy receiver/   # FastAPI webhook receiver for integration testing
└── ui/               # Next.js console for operating and demoing the platform
```

## Core Capabilities

- Durable event ingestion with PostgreSQL as the source of truth
- Endpoint registration with event-type subscriptions
- One event to many endpoint fan-out
- DB-backed worker using `FOR UPDATE SKIP LOCKED`
- At-least-once webhook delivery semantics
- Retry on timeout, `429`, and `5xx`
- Exponential backoff with jitter
- DLQ-style failed delivery state
- Manual replay for failed deliveries
- API key authentication
- User session authentication for dashboard APIs
- App ownership and onboarding/dashboard APIs
- Explicit per-app event catalog
- Show-once API keys and endpoint signing secrets
- HMAC-signed webhook delivery
- Swagger/OpenAPI documentation
- Next.js console for end-to-end operation and inspection
- FastAPI receiver for testing webhook delivery locally or through ngrok

## Stack

### Platform API And Worker

- Node.js + TypeScript
- Fastify
- PostgreSQL
- Drizzle ORM
- Docker Compose
- Swagger/OpenAPI

### Receiver

- Python
- FastAPI
- Uvicorn

### Console

- Next.js
- TypeScript
- Tailwind CSS
- shadcn-style components

## Services

| Service | Path | Default Port | Purpose |
| --- | --- | ---: | --- |
| Platform API | `server/` | `3000` | Accepts events, manages endpoints, exposes delivery logs and replay APIs |
| Platform Worker | `server/` | none | Polls due delivery rows and sends webhooks |
| PostgreSQL | `server/docker-compose.yml` | `5432` | Stores apps, API keys, endpoints, events, deliveries, attempts, and replay audits |
| Receiver | `dummy receiver/` | `4000` | Receives webhook requests and optionally verifies signatures |
| Console | `ui/` | `3001` | Product UI with signup, onboarding, dashboard, and demo console |

## Local Development

### 1. Start PostgreSQL

```bash
cd server
docker compose up -d
```

### 2. Start The Platform API And Worker

Install dependencies:

```bash
cd server
npm install
```

Run migrations and seed a demo app/API key:

```bash
npm run db:migrate
npm run db:seed
```

The seed command prints an API key:

```text
API Key: whsec_...
```

Use this key for `/v1/*` API calls. In the UI, paste only the raw `whsec_...` value.

Start the API:

```bash
npm run dev:api
```

Start the worker in another terminal:

```bash
cd server
npm run dev:worker
```

Platform API docs:

```text
http://localhost:3000/docs
```

OpenAPI JSON:

```text
http://localhost:3000/openapi.json
```

### 3. Start The Receiver

```bash
cd "dummy receiver"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 4000
```

Receiver docs:

```text
http://localhost:4000/docs
```

Received events:

```text
http://localhost:4000/events
```

### 4. Start The Console

```bash
cd ui
npm install
npm run dev
```

Open:

```text
http://localhost:3001
```

Product routes:

```text
/                 Landing page
/signup           Create account
/login            Log in
/onboarding/*     First-time setup wizard
/dashboard/*      App operations dashboard
/demo-console     API-key based test console
```

Default local values:

```text
Platform API: http://localhost:3000
Receiver service: http://localhost:4000
Webhook URL: http://localhost:4000/webhook
API key: whsec_... from npm run db:seed
```

## Auth And Dashboard

Reeler now has two auth layers:

- **Machine APIs** (`/v1/*`): API key bearer auth for event ingestion and delivery inspection
- **Product APIs** (`/auth/*`, `/dashboard/*`): session cookie auth for signup, onboarding, and dashboard operations

### Environment variables (server)

```text
SESSION_SECRET=change-me-in-production
SESSION_COOKIE_NAME=reeler_session
SESSION_TTL_DAYS=30
```

### Auth APIs

```http
POST /auth/signup
POST /auth/login
POST /auth/logout
GET  /auth/me
```

### Dashboard APIs

```http
GET/POST  /dashboard/apps
GET/POST  /dashboard/apps/:app_id/events
GET/POST  /dashboard/apps/:app_id/endpoints
GET/POST  /dashboard/apps/:app_id/api-keys
POST      /dashboard/apps/:app_id/api-keys/:key_id/revoke
GET       /dashboard/apps/:app_id/deliveries
POST      /dashboard/deliveries/:delivery_id/replay
```

API keys and endpoint signing secrets are returned **once** at creation. Later list endpoints return metadata only.

### Event catalog

Owned apps can register explicit event types in the catalog. When a catalog has entries, `/v1/events` rejects unknown `event_type` values for that app. Seeded demo apps with no catalog entries remain backward compatible.

### Backward compatibility

Apps created by `npm run db:seed` have no `owner_user_id`. They remain accessible via API key but do not appear in the dashboard.

## API Overview

All platform `/v1/*` endpoints require:

```http
Authorization: Bearer <api_key>
```

Create an endpoint:

```bash
curl -X POST http://localhost:3000/v1/endpoints \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localhost:4000/webhook","event_types":["payment_success"]}'
```

Ingest an event:

```bash
curl -X POST http://localhost:3000/v1/events \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"payment_success","payload":{"invoice_id":"inv_123","amount":4999}}'
```

Inspect event delivery:

```bash
curl http://localhost:3000/v1/events/<event_id> \
  -H "Authorization: Bearer $API_KEY"
```

List deliveries:

```bash
curl http://localhost:3000/v1/deliveries \
  -H "Authorization: Bearer $API_KEY"
```

Replay a failed delivery:

```bash
curl -X POST http://localhost:3000/v1/deliveries/<delivery_id>/replay \
  -H "Authorization: Bearer $API_KEY"
```

## Webhook Contract

Webhook requests are sent as JSON with:

```http
Content-Type: application/json
X-Event-ID: <event_id>
X-Timestamp: <unix_ts>
X-Signature: sha256=<hex_digest>
```

The signature is:

```text
HMAC_SHA256(endpoint_secret, timestamp + "." + raw_request_body)
```

Consumers can use `X-Event-ID` for deduplication and `X-Signature` for request verification.

## Delivery Rules

- Success: any HTTP `2xx`
- Retry: timeout, `429`, and `5xx`
- No retry: other `4xx`
- Timeout: 5 seconds
- Max attempts: 5
- Retry window: 15 minutes
- DLQ: represented by `deliveries.status = 'failed'`
- Duplicate ingested events are allowed; consumers deduplicate by `X-Event-ID`

## Demo Workflow

1. Start PostgreSQL, the platform API, the worker, the receiver, and the console.
2. Paste the seeded API key into the console.
3. Register a receiver endpoint for `payment_success`.
4. Publish a `payment_success` event.
5. Observe delivery state in the console.
6. Confirm the receiver inbox gets the webhook.
7. Stop the receiver to force retries/failure.
8. Restart the receiver and replay the failed delivery.

## Public Webhook Testing With ngrok

Expose the receiver:

```bash
ngrok http 4000
```

Use the generated URL as the endpoint:

```text
https://<ngrok-domain>/webhook
```

## Verification

Platform:

```bash
cd server
npm run build
npm test
npm audit --omit=dev
```

Console:

```bash
cd ui
npm run build
npm audit --omit=dev
```

Receiver:

```bash
cd "dummy receiver"
python3 -m py_compile main.py
```

## Design Notes

- The worker is a separate process, not an HTTP server.
- PostgreSQL is the source of truth for events and deliveries.
- The worker polls due rows rather than relying on Redis or an external queue.
- `FOR UPDATE SKIP LOCKED` allows multiple workers to safely process deliveries concurrently.
- Endpoint registration is idempotent by URL for an app; duplicate active endpoint rows are avoided.
- Reeler currently models DLQ as failed delivery rows rather than a separate table.
- The receiver app is included to exercise and verify the webhook contract during development.

