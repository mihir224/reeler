# Reeler Console

Next.js console for operating and showcasing the Reeler webhook delivery platform.

The console is not the core delivery system. It is a UI layer that talks to the platform API and the dummy receiver so the full workflow can be tested from one place.

## Features

- Configure platform API URL, receiver URL, and API key
- Check platform and receiver health
- Register webhook endpoints
- Publish test events
- Inspect delivery rows and status
- Replay failed deliveries
- Inspect events received by the dummy receiver
- Proxy local service calls through Next.js route handlers to avoid CORS issues

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- shadcn-style local components
- lucide-react icons

## Setup

From this directory:

```bash
npm install
```

## Run

```bash
npm run dev
```

Open:

```text
http://localhost:3001
```

## Required Services

Start these from the monorepo root modules:

Platform API:

```bash
cd ../server
npm run dev:api
```

Platform worker:

```bash
cd ../server
npm run dev:worker
```

Dummy receiver:

```bash
cd "../dummy receiver"
source .venv/bin/activate
uvicorn main:app --reload --port 4000
```

## UI Defaults

Use these values for local development:

```text
Platform API: http://localhost:3000
Receiver service: http://localhost:4000
Webhook URL: http://localhost:4000/webhook
API key: whsec_... from cd ../server && npm run db:seed
```

The API key field accepts either:

```text
whsec_...
```

or:

```text
Bearer whsec_...
```

The UI normalizes it before forwarding requests.

## How It Works

Browser requests go to local Next.js API routes first:

```text
/api/platform/[...path]
/api/receiver/events
/api/healthcheck
```

Those route handlers forward requests to:

```text
http://localhost:3000
http://localhost:4000
```

This keeps the platform and receiver services free from demo-specific CORS configuration.

## Demo Flow

1. Start the platform API, worker, receiver, and console.
2. Paste the seeded API key.
3. Click **Check** to verify both services are reachable.
4. Register `http://localhost:4000/webhook` for `payment_success`.
5. Send a `payment_success` event.
6. Refresh and inspect the delivery ledger and receiver inbox.
7. Stop the receiver to force retries/failure.
8. Restart the receiver and replay a failed delivery.

## Scripts

```bash
npm run dev      # start Next.js on port 3001
npm run build    # production build
npm run start    # start production server on port 3001
```

## Verify

```bash
npm run build
npm audit --omit=dev
```

