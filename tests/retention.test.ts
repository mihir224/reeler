import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RETENTION_DAYS } from "../src/worker/retention.js";

describe("retention policy", () => {
  it("keeps MVP retention at seven days", () => {
    assert.equal(RETENTION_DAYS, 7);
  });
});
