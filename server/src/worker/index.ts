import { config } from "../config.js";
import { closeDb } from "../db/client.js";
import {
  claimDueDeliveries,
  deliverWebhook,
  recordDeliveryResult,
} from "./delivery.js";
import { runRetentionCleanup } from "./retention.js";

let isShuttingDown = false;
let lastCleanupAt = 0;

async function runOnce(): Promise<number> {
  const deliveries = await claimDueDeliveries(config.WORKER_BATCH_SIZE);

  await Promise.all(
    deliveries.map(async (delivery) => {
      const result = await deliverWebhook(delivery);
      await recordDeliveryResult({
        delivery,
        outcome: result.outcome,
        responseBodyPreview: result.responseBodyPreview,
        latencyMs: result.latencyMs,
      });
    }),
  );

  return deliveries.length;
}

export async function runWorker(): Promise<void> {
  console.log("Worker started");

  while (!isShuttingDown) {
    if (Date.now() - lastCleanupAt > 60 * 60 * 1000) {
      lastCleanupAt = Date.now();
      await runRetentionCleanup();
    }

    const claimedCount = await runOnce();
    if (claimedCount === 0) {
      await new Promise((resolve) => setTimeout(resolve, config.WORKER_POLL_INTERVAL_MS));
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const shutdown = async () => {
    isShuttingDown = true;
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  runWorker().catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
}
