import {
  MAX_DELIVERY_ATTEMPTS,
  MAX_RETRY_WINDOW_MS,
} from "./constants.js";

export type DeliveryOutcome =
  | { kind: "success"; responseCode: number }
  | { kind: "retryable"; responseCode?: number; error: string }
  | { kind: "failed"; responseCode?: number; error: string };

const BACKOFF_SECONDS = [2, 4, 8, 16, 32];

export function classifyHttpResult(statusCode: number): DeliveryOutcome {
  if (statusCode >= 200 && statusCode < 300) {
    return { kind: "success", responseCode: statusCode };
  }

  if (statusCode === 429 || statusCode >= 500) {
    return {
      kind: "retryable",
      responseCode: statusCode,
      error: `Retryable HTTP ${statusCode}`,
    };
  }

  return {
    kind: "failed",
    responseCode: statusCode,
    error: `Non-retryable HTTP ${statusCode}`,
  };
}

export function timeoutOutcome(): DeliveryOutcome {
  return { kind: "retryable", error: "Request timed out" };
}

export function networkErrorOutcome(message: string): DeliveryOutcome {
  return { kind: "retryable", error: message };
}

export function calculateNextRetryAt(params: {
  attemptCountAfterCurrentAttempt: number;
  deliveryCreatedAt: Date;
  now?: Date;
  jitterRatio?: number;
}): Date | null {
  const now = params.now ?? new Date();
  const attempts = params.attemptCountAfterCurrentAttempt;
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return null;
  if (now.getTime() - params.deliveryCreatedAt.getTime() >= MAX_RETRY_WINDOW_MS) return null;

  const baseSeconds = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
  const jitterRatio = params.jitterRatio ?? Math.random();
  const jitterMs = Math.floor(baseSeconds * 1000 * 0.2 * jitterRatio);
  const delayMs = baseSeconds * 1000 + jitterMs;
  const retryAt = new Date(now.getTime() + delayMs);

  const retryWindowEnd = new Date(params.deliveryCreatedAt.getTime() + MAX_RETRY_WINDOW_MS);
  return retryAt <= retryWindowEnd ? retryAt : null;
}
