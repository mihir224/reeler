import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateNextRetryAt,
  classifyHttpResult,
  timeoutOutcome,
} from "../src/domain/retry.js";

describe("retry policy", () => {
  it("classifies 2xx responses as success", () => {
    assert.deepEqual(classifyHttpResult(204), { kind: "success", responseCode: 204 });
  });

  it("retries 429 and 5xx responses", () => {
    assert.equal(classifyHttpResult(429).kind, "retryable");
    assert.equal(classifyHttpResult(500).kind, "retryable");
    assert.equal(timeoutOutcome().kind, "retryable");
  });

  it("does not retry other 4xx responses", () => {
    assert.equal(classifyHttpResult(400).kind, "failed");
    assert.equal(classifyHttpResult(401).kind, "failed");
    assert.equal(classifyHttpResult(404).kind, "failed");
  });

  it("calculates bounded exponential backoff with jitter", () => {
    const now = new Date("2026-05-02T00:00:00.000Z");
    const deliveryCreatedAt = new Date(now.getTime() - 1_000);

    const retryAt = calculateNextRetryAt({
      attemptCountAfterCurrentAttempt: 1,
      deliveryCreatedAt,
      now,
      jitterRatio: 0.5,
    });

    assert.equal(retryAt?.getTime(), now.getTime() + 2_200);
  });

  it("stops after max attempts", () => {
    const now = new Date("2026-05-02T00:00:00.000Z");
    assert.equal(
      calculateNextRetryAt({
        attemptCountAfterCurrentAttempt: 5,
        deliveryCreatedAt: now,
        now,
      }),
      null,
    );
  });

  it("stops after retry window", () => {
    const now = new Date("2026-05-02T00:16:00.000Z");
    const deliveryCreatedAt = new Date("2026-05-02T00:00:00.000Z");
    assert.equal(
      calculateNextRetryAt({
        attemptCountAfterCurrentAttempt: 1,
        deliveryCreatedAt,
        now,
      }),
      null,
    );
  });
});
