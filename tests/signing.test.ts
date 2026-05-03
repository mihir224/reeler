import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWebhookSignature } from "../src/domain/signing.js";

describe("webhook signing", () => {
  it("signs timestamp dot raw body with sha256 prefix", () => {
    const secret = "whsig_test";
    const timestamp = 1_777_680_000;
    const rawBody = '{"ok":true}';
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    assert.equal(createWebhookSignature({ secret, timestamp, rawBody }), `sha256=${expected}`);
  });
});
