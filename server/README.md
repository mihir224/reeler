# Reeler Platform Server

Fastify + PostgreSQL service that powers Reeler's reliable outbound webhook delivery platform.

This module owns:

- API key authentication
- App-scoped endpoint registration
- Durable event ingestion
- Endpoint fan-out by event type
- Delivery logs and event inspection APIs
- Failed delivery replay
- Swagger/OpenAPI documentation
- Background worker for asynchronous webhook delivery

## Stack

- Node.js + TypeScript
- Fastify
- PostgreSQL
- Drizzle ORM
- Docker Compose
- Swagger/OpenAPI

## Architecture

```text
Producer API call
  -> Fastify API
  -> PostgreSQL events + deliveries
  -> Worker polls due deliveries
  -> Worker sends signed webhook request
  -> Worker records attempt and final delivery state
```

PostgreSQL is the source of truth. The worker uses `FOR UPDATE SKIP LOCKED` to safely claim delivery rows, which allows multiple workers to process work concurrently without sending the same delivery twice.

## Setup

From this directory:

```bash
npm install
docker compose up -d
npm run db:migrate
npm run db:seed
```

The seed script prints a demo API key:

```text
API Key: whsec_...
```

Use that key as:

```http
Authorization: Bearer <api_key>
```

## Run

Start the API:

```bash
npm run dev:api
```

Start the worker in another terminal:

```bash
npm run dev:worker
```

API:

```text
http://localhost:3000
```

Swagger UI:

```text
http://localhost:3000/docs
```

OpenAPI JSON:

```text
http://localhost:3000/openapi.json
```

## API

All `/v1/*` endpoints require a bearer API key.

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

List deliveries:

```bash
curl http://localhost:3000/v1/deliveries \
  -H "Authorization: Bearer $API_KEY"
```

Inspect event delivery:

```bash
curl http://localhost:3000/v1/events/<event_id> \
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

Signature format:

```text
HMAC_SHA256(endpoint_secret, timestamp + "." + raw_request_body)
```

Consumers should use `X-Event-ID` for deduplication and `X-Signature` for authenticity verification.

## Delivery Rules

- Success: any HTTP `2xx`
- Retry: timeout, `429`, and `5xx`
- No retry: other `4xx`
- Timeout: 5 seconds
- Max attempts: 5
- Retry window: 15 minutes
- DLQ: represented by `deliveries.status = 'failed'`
- Duplicate ingested events are allowed; consumers deduplicate by `X-Event-ID`

## Scripts

```bash
npm run dev:api       # start Fastify API
npm run dev:worker    # start delivery worker
npm run build         # compile TypeScript
npm test              # run unit tests
npm run db:migrate    # apply SQL migrations
npm run db:seed       # create demo app and API key
```

## Verify

```bash
npm run build
npm test
npm audit --omit=dev
```

