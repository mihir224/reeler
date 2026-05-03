import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canReplayDelivery } from "../src/domain/replay.js";

describe("replay rules", () => {
  it("only allows failed deliveries to be replayed", () => {
    assert.equal(canReplayDelivery("failed"), true);
    assert.equal(canReplayDelivery("delivered"), false);
    assert.equal(canReplayDelivery("pending"), false);
    assert.equal(canReplayDelivery("retry_scheduled"), false);
    assert.equal(canReplayDelivery("in_progress"), false);
  });
});
