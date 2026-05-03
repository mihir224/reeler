import type { DeliveryStatus } from "../db/schema.js";

export function canReplayDelivery(status: DeliveryStatus): boolean {
  return status === "failed";
}
