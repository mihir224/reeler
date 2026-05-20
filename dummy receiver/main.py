import hashlib
import hmac
import json
import os
import time
from collections import deque
from typing import Any, Deque, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

load_dotenv()

SIGNING_SECRET = os.getenv("WEBHOOK_SIGNING_SECRET", "").strip()
MAX_TIMESTAMP_SKEW_SECONDS = int(os.getenv("MAX_TIMESTAMP_SKEW_SECONDS", "300"))
RECENT_EVENTS_LIMIT = 50

app = FastAPI(
    title="Webhook Receiver Demo",
    description="Local receiver for testing signed webhooks from the Reliable Event Delivery Platform.",
    version="0.1.0",
)

recent_events: Deque[Dict[str, Any]] = deque(maxlen=RECENT_EVENTS_LIMIT)
seen_event_ids: set[str] = set()


@app.get("/health")
async def health() -> Dict[str, bool]:
    return {"ok": True}


@app.get("/events")
async def list_events() -> Dict[str, Any]:
    return {
        "count": len(recent_events),
        "events": list(recent_events),
    }


@app.post("/webhook")
async def receive_webhook(
    request: Request,
    x_event_id: Optional[str] = Header(default=None),
    x_timestamp: Optional[str] = Header(default=None),
    x_signature: Optional[str] = Header(default=None),
) -> JSONResponse:
    raw_body = await request.body()

    if SIGNING_SECRET:
        verify_signature(
            secret=SIGNING_SECRET,
            raw_body=raw_body,
            event_id=x_event_id,
            timestamp=x_timestamp,
            signature=x_signature,
        )

    payload = parse_json(raw_body)
    is_duplicate = bool(x_event_id and x_event_id in seen_event_ids)
    if x_event_id:
        seen_event_ids.add(x_event_id)

    received_event = {
        "event_id": x_event_id,
        "timestamp": x_timestamp,
        "signature_present": x_signature is not None,
        "duplicate": is_duplicate,
        "payload": payload,
        "received_at": int(time.time()),
    }
    recent_events.appendleft(received_event)

    print(json.dumps({"received_webhook": received_event}, default=str))

    return JSONResponse(
        status_code=200,
        content={
            "received": True,
            "event_id": x_event_id,
            "duplicate": is_duplicate,
        },
    )


def verify_signature(
    *,
    secret: str,
    raw_body: bytes,
    event_id: Optional[str],
    timestamp: Optional[str],
    signature: Optional[str],
) -> None:
    if not event_id:
        raise HTTPException(status_code=400, detail="Missing X-Event-ID header")
    if not timestamp:
        raise HTTPException(status_code=400, detail="Missing X-Timestamp header")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Signature header")

    try:
        timestamp_int = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid X-Timestamp header") from exc

    now = int(time.time())
    if abs(now - timestamp_int) > MAX_TIMESTAMP_SKEW_SECONDS:
        raise HTTPException(status_code=400, detail="Webhook timestamp is outside allowed skew")

    signed_payload = f"{timestamp}.{raw_body.decode('utf-8')}".encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    expected_signature = f"sha256={digest}"

    if not hmac.compare_digest(expected_signature, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")


def parse_json(raw_body: bytes) -> Any:
    try:
        return json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Webhook body must be valid JSON") from exc
