import { pool } from "../db/client.js";
import { RESPONSE_BODY_PREVIEW_BYTES, DELIVERY_TIMEOUT_MS } from "../domain/constants.js";
import { createWebhookSignature } from "../domain/signing.js";
import {
  calculateNextRetryAt,
  classifyHttpResult,
  networkErrorOutcome,
  timeoutOutcome,
  type DeliveryOutcome,
} from "../domain/retry.js";

export type ClaimedDelivery = {
  id: string;
  event_id: string;
  endpoint_id: string;
  url: string;
  secret: string;
  payload: unknown;
  attempt_count: number;
  created_at: Date;
  first_attempted_at: Date | null;
};

export async function claimDueDeliveries(batchSize: number): Promise<ClaimedDelivery[]> {
  const result = await pool.query<ClaimedDelivery>(
    `
      WITH due AS (
        SELECT d.id
        FROM deliveries d
        WHERE d.status IN ('pending', 'retry_scheduled')
          AND (d.next_retry_at IS NULL OR d.next_retry_at <= now())
        ORDER BY COALESCE(d.next_retry_at, d.created_at), d.created_at
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE deliveries d
      SET status = 'in_progress', updated_at = now()
      FROM due, events e, endpoints ep
      WHERE d.id = due.id
        AND d.event_id = e.id
        AND d.endpoint_id = ep.id
      RETURNING
        d.id,
        d.event_id,
        d.endpoint_id,
        ep.url,
        ep.secret,
        e.payload,
        d.attempt_count,
        d.created_at,
        d.first_attempted_at
    `,
    [batchSize],
  );

  return result.rows;
}

export async function deliverWebhook(delivery: ClaimedDelivery): Promise<{
  outcome: DeliveryOutcome;
  responseBodyPreview?: string;
  latencyMs: number;
}> {
  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(delivery.url, {
      method: "POST",
      body: rawBody,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Event-ID": delivery.event_id,
        "X-Timestamp": String(timestamp),
        "X-Signature": createWebhookSignature({
          secret: delivery.secret,
          timestamp,
          rawBody,
        }),
      },
    });

    const text = await response.text();
    return {
      outcome: classifyHttpResult(response.status),
      responseBodyPreview: Buffer.from(text).subarray(0, RESPONSE_BODY_PREVIEW_BYTES).toString("utf8"),
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown delivery error";
    return {
      outcome: message.toLowerCase().includes("abort")
        ? timeoutOutcome()
        : networkErrorOutcome(message),
      latencyMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function recordDeliveryResult(params: {
  delivery: ClaimedDelivery;
  outcome: DeliveryOutcome;
  responseBodyPreview?: string;
  latencyMs: number;
  now?: Date;
}): Promise<void> {
  const now = params.now ?? new Date();
  const nextAttemptCount = params.delivery.attempt_count + 1;
  const responseCode =
    "responseCode" in params.outcome ? params.outcome.responseCode ?? null : null;
  const errorMessage = params.outcome.kind === "success" ? null : params.outcome.error;
  const firstAttemptedAt = params.delivery.first_attempted_at ?? now;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    if (params.outcome.kind === "success") {
      await client.query(
        `
          UPDATE deliveries
          SET status = 'delivered',
              attempt_count = $2,
              last_error = NULL,
              last_response_code = $3,
              first_attempted_at = $4,
              delivered_at = $5,
              failed_at = NULL,
              next_retry_at = NULL,
              updated_at = $5
          WHERE id = $1
        `,
        [params.delivery.id, nextAttemptCount, responseCode, firstAttemptedAt, now],
      );

      await insertAttempt(client, {
        deliveryId: params.delivery.id,
        attemptNumber: nextAttemptCount,
        status: "succeeded",
        responseCode,
        responseBodyPreview: params.responseBodyPreview,
        errorMessage: null,
        latencyMs: params.latencyMs,
        attemptedAt: now,
      });
    } else if (params.outcome.kind === "retryable") {
      const nextRetryAt = calculateNextRetryAt({
        attemptCountAfterCurrentAttempt: nextAttemptCount,
        deliveryCreatedAt: params.delivery.created_at,
        now,
      });

      if (nextRetryAt) {
        await client.query(
          `
            UPDATE deliveries
            SET status = 'retry_scheduled',
                attempt_count = $2,
                next_retry_at = $3,
                last_error = $4,
                last_response_code = $5,
                first_attempted_at = $6,
                updated_at = $7
            WHERE id = $1
          `,
          [
            params.delivery.id,
            nextAttemptCount,
            nextRetryAt,
            errorMessage,
            responseCode,
            firstAttemptedAt,
            now,
          ],
        );

        await insertAttempt(client, {
          deliveryId: params.delivery.id,
          attemptNumber: nextAttemptCount,
          status: "retry_scheduled",
          responseCode,
          responseBodyPreview: params.responseBodyPreview,
          errorMessage,
          latencyMs: params.latencyMs,
          attemptedAt: now,
        });
      } else {
        await failDelivery(client, {
          deliveryId: params.delivery.id,
          attemptNumber: nextAttemptCount,
          responseCode,
          responseBodyPreview: params.responseBodyPreview,
          errorMessage,
          firstAttemptedAt,
          latencyMs: params.latencyMs,
          attemptedAt: now,
        });
      }
    } else {
      await failDelivery(client, {
        deliveryId: params.delivery.id,
        attemptNumber: nextAttemptCount,
        responseCode,
        responseBodyPreview: params.responseBodyPreview,
        errorMessage,
        firstAttemptedAt,
        latencyMs: params.latencyMs,
        attemptedAt: now,
      });
    }

    await refreshEventStatus(client, params.delivery.event_id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type TransactionClient = {
  query: (statement: string, values?: unknown[]) => Promise<unknown>;
};

async function insertAttempt(client: TransactionClient, params: {
  deliveryId: string;
  attemptNumber: number;
  status: "succeeded" | "retry_scheduled" | "failed";
  responseCode: number | null;
  responseBodyPreview?: string;
  errorMessage: string | null;
  latencyMs: number;
  attemptedAt: Date;
}): Promise<void> {
  await client.query(
    `
      INSERT INTO delivery_attempts (
        delivery_id,
        attempt_number,
        status,
        response_code,
        response_body_preview,
        error_message,
        latency_ms,
        attempted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
    [
      params.deliveryId,
      params.attemptNumber,
      params.status,
      params.responseCode,
      params.responseBodyPreview ?? null,
      params.errorMessage,
      params.latencyMs,
      params.attemptedAt,
    ],
  );
}

async function failDelivery(client: TransactionClient, params: {
  deliveryId: string;
  attemptNumber: number;
  responseCode: number | null;
  responseBodyPreview?: string;
  errorMessage: string | null;
  firstAttemptedAt: Date;
  latencyMs: number;
  attemptedAt: Date;
}): Promise<void> {
  await client.query(
    `
      UPDATE deliveries
      SET status = 'failed',
          attempt_count = $2,
          next_retry_at = NULL,
          last_error = $3,
          last_response_code = $4,
          first_attempted_at = $5,
          failed_at = $6,
          updated_at = $6
      WHERE id = $1
    `,
    [
      params.deliveryId,
      params.attemptNumber,
      params.errorMessage,
      params.responseCode,
      params.firstAttemptedAt,
      params.attemptedAt,
    ],
  );

  await insertAttempt(client, {
    deliveryId: params.deliveryId,
    attemptNumber: params.attemptNumber,
    status: "failed",
    responseCode: params.responseCode,
    responseBodyPreview: params.responseBodyPreview,
    errorMessage: params.errorMessage,
    latencyMs: params.latencyMs,
    attemptedAt: params.attemptedAt,
  });
}

export async function refreshEventStatus(client: TransactionClient, eventId: string): Promise<void> {
  await client.query(
    `
      UPDATE events e
      SET status = CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM deliveries d WHERE d.event_id = e.id
        ) THEN 'accepted'::event_status
        WHEN EXISTS (
          SELECT 1 FROM deliveries d
          WHERE d.event_id = e.id
            AND d.status NOT IN ('delivered', 'failed')
        ) THEN 'accepted'::event_status
        WHEN EXISTS (
          SELECT 1 FROM deliveries d
          WHERE d.event_id = e.id
            AND d.status = 'failed'
        ) AND EXISTS (
          SELECT 1 FROM deliveries d
          WHERE d.event_id = e.id
            AND d.status = 'delivered'
        ) THEN 'partially_delivered'::event_status
        WHEN EXISTS (
          SELECT 1 FROM deliveries d
          WHERE d.event_id = e.id
            AND d.status = 'failed'
        ) THEN 'failed'::event_status
        ELSE 'delivered'::event_status
      END
      WHERE e.id = $1
    `,
    [eventId],
  );
}
