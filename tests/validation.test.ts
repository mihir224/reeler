import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_PAYLOAD_BYTES } from "../src/domain/constants.js";
import { assertPayloadSize } from "../src/domain/validation.js";

describe("payload validation", () => {
  it("accepts payloads under 256KB", () => {
    assert.doesNotThrow(() => assertPayloadSize({ message: "hello" }));
  });

  it("rejects payloads over 256KB", () => {
    assert.throws(() => assertPayloadSize({ data: "x".repeat(MAX_PAYLOAD_BYTES) }), /Payload exceeds/);
  });
});
