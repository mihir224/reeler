# Reeler Event Delivery Platform MVP

API-first webhook infrastructure with durable Postgres ingestion, endpoint fan-out, retry, failed-delivery replay, and HMAC signed webhook delivery.

## Stack

- Node.js + TypeScript
- Fastify API
- Drizzle schema
- PostgreSQL as the source of truth
- DB-polling worker with `FOR UPDATE SKIP LOCKED`

## Local Setup

Install dependencies:

```bash
npm install
```

Start Postgres:

```bash
docker compose up -d
```

Run migrations and seed a demo app/API key:

```bash
npm run db:migrate
npm run db:seed
```

Start the API and worker in separate terminals:

```bash
npm run dev:api
npm run dev:worker
```

## API

All `/v1/*` endpoints require:

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

## MVP Delivery Rules

- Success: any HTTP `2xx`
- Retry: timeout, `429`, and `5xx`
- No retry: other `4xx`
- Timeout: 5 seconds
- Max attempts: 5
- Retry window: 15 minutes
- DLQ: represented by `deliveries.status = 'failed'`
- Duplicate ingested events are allowed; consumers deduplicate by `X-Event-ID`
