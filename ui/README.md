# Webhook Relay Console

Next.js demo UI for showcasing the Reliable Event Delivery Platform end to end.

The console lets you:

- Configure the platform API URL, receiver URL, and API key
- Register a webhook receiver endpoint
- Publish a test event
- Inspect platform delivery rows
- Replay failed deliveries
- Inspect events received by the FastAPI receiver
- Check platform and receiver health

## Related Services

Platform API:

```bash
cd /Users/mihir/dev-mihir/Projects/webhooks-project
npm run dev:api
```

Platform worker:

```bash
cd /Users/mihir/dev-mihir/Projects/webhooks-project
npm run dev:worker
```

Receiver:

```bash
cd /Users/mihir/dev-mihir/Projects/webhook-receiver
source .venv/bin/activate
uvicorn main:app --reload --port 4000
```

## Run The UI

```bash
cd /Users/mihir/dev-mihir/Projects/webhook-demo-ui
npm install
npm run dev
```

Open:

```text
http://localhost:3001
```

## Local Demo Flow

1. Start Postgres, platform API, platform worker, and receiver.
2. Paste the platform API key into the console.
3. Use `http://localhost:4000/webhook` as the endpoint URL for local testing.
4. Register the endpoint.
5. Send a `payment_success` event.
6. Refresh delivery and receiver state.

For public webhook testing, expose the receiver:

```bash
ngrok http 4000
```

Then register:

```text
https://<ngrok-domain>/webhook
```

## Why The UI Uses Proxy Routes

The browser talks to local Next.js API routes first. Those route handlers forward requests to the platform API and receiver service.

This avoids CORS issues while keeping the platform and receiver code focused on their own responsibilities.
