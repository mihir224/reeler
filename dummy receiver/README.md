# Reeler Dummy Receiver

FastAPI service used to receive and inspect webhook deliveries from the Reeler platform.

This module behaves like a consumer-owned webhook endpoint. It is useful for local development, ngrok-based public testing, and demonstrating how receivers validate signed webhook requests.

## Endpoints

- `POST /webhook` - receives webhook events
- `GET /events` - returns recently received webhook events
- `GET /health` - health check
- `GET /docs` - FastAPI Swagger UI

## Setup

From this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Optional `.env` values:

```text
PORT=4000
WEBHOOK_SIGNING_SECRET=
MAX_TIMESTAMP_SKEW_SECONDS=300
```

If `WEBHOOK_SIGNING_SECRET` is empty, the receiver accepts unsigned requests. If it is set, the receiver verifies `X-Signature`.

## Run

```bash
source .venv/bin/activate
uvicorn main:app --reload --port 4000
```

Open:

```text
http://localhost:4000/docs
```

Inspect received events:

```bash
curl http://localhost:4000/events
```

## Use With Reeler Platform

Start the platform API and worker from `../server`:

```bash
cd ../server
npm run dev:api
npm run dev:worker
```

Register this receiver:

```bash
curl -X POST http://localhost:3000/v1/endpoints \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localhost:4000/webhook","event_types":["payment_success"]}'
```

Send an event:

```bash
curl -X POST http://localhost:3000/v1/events \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"payment_success","payload":{"invoice_id":"inv_123","amount":4999}}'
```

## Signature Verification

When `WEBHOOK_SIGNING_SECRET` is set, the receiver verifies:

```http
X-Event-ID: <event_id>
X-Timestamp: <unix_ts>
X-Signature: sha256=<hex_digest>
```

Expected signature:

```text
signed_payload = timestamp + "." + raw_request_body
signature = HMAC_SHA256(signing_secret, signed_payload)
```

The receiver rejects:

- Missing signature headers
- Invalid timestamps
- Timestamps outside `MAX_TIMESTAMP_SKEW_SECONDS`
- Invalid HMAC signatures
- Invalid JSON bodies

It also marks duplicate webhook deliveries using `X-Event-ID`.

## Expose With ngrok

```bash
ngrok http 4000
```

Use the generated public URL as the Reeler endpoint:

```text
https://<ngrok-domain>/webhook
```

## Verify

```bash
python3 -m py_compile main.py
```

