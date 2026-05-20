# Reliable Event Delivery Platform - Project Notes

## 1. What We Built

This project is an API-first MVP for a reliable outbound webhook delivery platform.

The core promise is:

> Durably ingest events and retry delivery until success or explicit failure.

The system lets an event-producing app:

1. Authenticate using an API key.
2. Register webhook endpoints for specific event types.
3. Ingest events through an API.
4. Store events durably in Postgres.
5. Create one delivery row per matching endpoint.
6. Use a worker process to deliver webhooks asynchronously.
7. Retry retryable failures.
8. Mark exhausted deliveries as failed/DLQ.
9. Replay failed deliveries manually.
10. Inspect events, deliveries, and attempts through APIs.

The project lives at:

```bash
/Users/mihir/dev-mihir/Projects/webhooks-project
```

## 2. Current Architecture

The system has two runnable processes:

```text
API server
Worker
```

The API server handles:

- Health check
- Swagger/OpenAPI docs
- API key authentication
- Endpoint registration
- Event ingestion
- Event inspection
- Delivery listing
- Failed delivery replay

The worker handles:

- Polling due deliveries from Postgres
- Claiming rows with `FOR UPDATE SKIP LOCKED`
- Sending webhook HTTP requests
- Signing webhook payloads
- Recording delivery attempts
- Retry scheduling
- Marking final failures
- Retention cleanup

High-level flow:

```text
Producer app
  -> POST /v1/events
  -> API stores event in Postgres
  -> API creates delivery rows for matching endpoints
  -> Worker polls pending deliveries
  -> Worker sends signed webhook requests
  -> Worker records success, retry, or failure
```

Postgres is the source of truth. There is no Redis or external queue in the MVP.

## 3. Important Product Decisions

### Product Model

The current product model is **emitter-owned outbound webhook delivery**.

That means:

- The event producer onboards to our service.
- The producer creates an app/API key.
- The producer registers consumer webhook endpoints.
- The producer sends events to our API.
- Our service delivers events to the registered consumer endpoints.
- Consumers do not need accounts in our service for the MVP.

This is different from a receiver-owned webhook inbox product.

### API Keys

API keys are used to authenticate the producer and derive `app_id`.

We do not trust `app_id` from request bodies.

```text
Authorization: Bearer <api_key>
        -> api_keys table
        -> app_id
```

This protects tenant isolation and ensures an app can only access its own events, deliveries, and endpoints.

### Endpoint Ownership

The producer defines webhook endpoints by calling:

```http
POST /v1/endpoints
```

Each endpoint subscribes to one or more event types.

One event can fan out to multiple endpoints.

Example:

```text
payment_success event
  -> billing endpoint
  -> analytics endpoint
  -> email endpoint
```

Each event-to-endpoint pair becomes a separate delivery row.

### Endpoint Secrets

Each endpoint gets its own signing secret:

```ts
whsig_${randomBytes(32).toString("base64url")}
```

This gives 256 bits of randomness. Collisions are practically impossible, but not mathematically impossible. A future hardening item is to add a unique DB constraint and regenerate on conflict.

Per-endpoint secrets are preferred over one app-level secret because a leak from one consumer should not compromise other consumers.

### Secret Propagation

The producer is responsible for onboarding the consumer.

Intended future flow:

```text
Producer dashboard/backend
  -> calls our POST /v1/endpoints API
  -> receives endpoint signing secret once
  -> shares verification material with the consumer
  -> consumer verifies signed webhook requests
```

Currently, the API generates and stores endpoint secrets, but it does not return the signing secret in the endpoint creation response. That is a pending item.

### Signed Webhooks

The worker signs every webhook request.

Headers sent:

```http
Content-Type: application/json
X-Event-ID: <event_id>
X-Timestamp: <unix_ts>
X-Signature: sha256=<hex_digest>
```

Signature format:

```text
signed_payload = timestamp + "." + raw_request_body
signature = HMAC_SHA256(endpoint_secret, signed_payload)
```

Purpose:

- Prove the webhook came from our platform.
- Prove the payload was not modified.
- Let consumers reject stale requests using the timestamp.

Important caveat:

Webhook signing only helps if the consumer receives the signing secret and implements verification.

### Idempotency

Current MVP behavior:

- Event ingestion is not idempotent.
- Duplicate event requests are allowed.
- Each event request creates a new `event_id`.
- Webhook consumers deduplicate using `X-Event-ID`.

Future enhancement:

Support an `Idempotency-Key` header for producer retries.

## 4. Data Model

Tables:

- `apps`
- `api_keys`
- `endpoints`
- `events`
- `deliveries`
- `delivery_attempts`
- `replay_audits`

Important distinction:

```text
event = what happened
delivery = sending that event to one endpoint
delivery_attempt = one HTTP attempt for a delivery
```

Delivery statuses:

```text
pending
in_progress
delivered
retry_scheduled
failed
```

Event statuses:

```text
accepted
partially_delivered
delivered
failed
```

DLQ is represented by:

```text
deliveries.status = 'failed'
```

There is no separate DLQ table in the MVP.

## 5. API Surface

All `/v1/*` endpoints require:

```http
Authorization: Bearer <api_key>
```

Health check:

```http
GET /health
```

Interactive API docs:

```http
GET /docs
```

OpenAPI JSON:

```http
GET /openapi.json
```

Create endpoint:

```http
POST /v1/endpoints
```

Request:

```json
{
  "url": "https://example.com/webhook",
  "event_types": ["payment_success", "order_created"]
}
```

Current response excludes the signing secret. This should be changed.

Ingest event:

```http
POST /v1/events
```

Request:

```json
{
  "event_type": "payment_success",
  "payload": {
    "invoice_id": "inv_123",
    "amount": 4999
  }
}
```

Response:

```json
{
  "event_id": "<uuid>",
  "delivery_count": 1
}
```

Inspect event:

```http
GET /v1/events/:event_id
```

List deliveries:

```http
GET /v1/deliveries
GET /v1/deliveries?status=failed
GET /v1/deliveries?status=pending
GET /v1/deliveries?status=delivered
```

Replay failed delivery:

```http
POST /v1/deliveries/:delivery_id/replay
```

Replay rules:

- Only failed deliveries can be replayed.
- Replay keeps the same `event_id`.
- Replay resets the delivery to `pending`.
- Replay records an audit row.

## 6. Delivery Contract

Success:

- Any HTTP `2xx`

Retry:

- Timeout
- HTTP `429`
- HTTP `5xx`

Do not retry:

- Other HTTP `4xx`

Limits:

- Timeout per attempt: 5 seconds
- Max attempts: 5
- Max retry window: 15 minutes

Backoff:

```text
2s, 4s, 8s, 16s, 32s + jitter
```

Payload limit:

```text
256 KB
```

Retention:

```text
7 days
```

The worker periodically deletes old events. Related deliveries and attempts are deleted through cascade behavior.

## 7. How To Run Locally

From the project directory:

```bash
cd /Users/mihir/dev-mihir/Projects/webhooks-project
```

Install dependencies:

```bash
npm install
```

Start Postgres:

```bash
docker compose up -d
```

Run migrations:

```bash
npm run db:migrate
```

Seed demo app/API key:

```bash
npm run db:seed
```

Start API:

```bash
npm run dev:api
```

Start worker in another terminal:

```bash
npm run dev:worker
```

Run build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## 8. Current Verification Status

Verified successfully:

- `npm install`
- `npm run build`
- `npm test`
- `npm run db:migrate`
- `npm run db:seed`
- Docker Postgres startup
- `/health` API smoke test
- `/docs` Swagger UI smoke test
- `/openapi.json` OpenAPI smoke test
- Production dependency audit

Current test status:

```text
11 tests passing
0 production vulnerabilities
```

Seeded demo app from verification:

```text
App ID: 2afbf52a-2c20-4274-b4cd-4d1540150861
API Key: whsec_NbfHyGT9cYI1cDXuDguUQNAYlgFcPY-yfP32e5tOiKk
```

## 9. Pending Items And Enhancements

### High Priority

- Return endpoint signing secret once during `POST /v1/endpoints`.
- Decide response shape for endpoint verification material.
- Add consumer-facing webhook verification docs and code examples.
- Add unique constraint on `endpoints.secret`.
- Regenerate endpoint secret on unique conflict.
- Add `Idempotency-Key` support for event ingestion.
- Add database constraint for `(app_id, idempotency_key)` once idempotency exists.
- Add integration tests with Postgres for ingestion, delivery creation, replay, and tenant isolation.
- Add worker integration tests using a local test webhook server.

### Product Contract

- Define producer-to-consumer onboarding flow explicitly.
- Decide whether endpoint secret should be returned as raw secret, encoded verification bundle, or both.
- Make clear that encoded does not mean encrypted.
- Add endpoint secret rotation API.
- Add endpoint disable/delete API.
- Add endpoint listing API.
- Add endpoint detail API.

### Security

- Store endpoint secrets encrypted at rest or use envelope encryption.
- Return endpoint secret only once.
- Avoid logging endpoint secrets.
- Add timestamp tolerance guidance for consumers, such as rejecting webhooks older than 5 minutes.
- Add constant-time signature verification example.
- Add API key rotation/revocation endpoints.
- Consider API key prefix and last-four display metadata.
- Validate endpoint URLs against SSRF risks before production use.
- Block private network targets in production unless explicitly allowed.

### Reliability

- Add stale `in_progress` delivery recovery if worker crashes mid-delivery.
- Add worker concurrency limits.
- Add endpoint-level rate limiting.
- Add app-level rate limiting.
- Add retry jitter tests with bounded ranges.
- Add delivery attempt uniqueness constraints.
- Add stronger event status transitions after replay.
- Add metrics for oldest pending delivery, DLQ rate, retry count, and worker errors.

### API And Developer Experience

- Add richer request/response examples for every endpoint.
- Keep Swagger schemas updated as endpoint response contracts evolve.
- Add a simple local webhook receiver script for demos.
- Add `.env` loading documentation.
- Add `npm run db:reset` for local development.
- Add `npm run demo` or a scripted happy-path flow.
- Add pagination to delivery/event listing.
- Add filtering by `event_type`, `endpoint_id`, and time range.

### Architecture / Post-MVP

- Optional Redis/BullMQ scheduling optimization while keeping Postgres as source of truth.
- Circuit breaker for repeatedly failing endpoints.
- Minimal dashboard for event and delivery visibility.
- Multi-app admin onboarding flow.
- Consumer self-serve portal if the product expands beyond emitter-owned onboarding.
- Multi-region support.
- Endpoint health scoring.
- Complex replay filters.

## 10. Current Positioning

This project is best described as:

> A reliable outbound webhook delivery platform for event-producing apps.

Interview pitch:

> I built a webhook delivery system that durably stores events in Postgres and guarantees at-least-once delivery. I used a DB-backed outbox-style model to avoid event loss, implemented retry with exponential backoff and jitter, handled failure classification including 429s, and added HMAC-based webhook signing for security. I also designed replay semantics for failed deliveries.
