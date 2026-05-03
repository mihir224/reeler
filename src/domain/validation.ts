import { z } from "zod";
import { isDevelopment } from "../config.js";
import { MAX_PAYLOAD_BYTES } from "./constants.js";

export const createEventSchema = z.object({
  event_type: z.string().min(1).max(128),
  payload: z.unknown(),
});

export const createEndpointSchema = z.object({
  url: z.string().url(),
  event_types: z.array(z.string().min(1).max(128)).min(1).max(100),
});

export function payloadSizeBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), "utf8");
}

export function assertPayloadSize(payload: unknown): void {
  if (payloadSizeBytes(payload) > MAX_PAYLOAD_BYTES) {
    throw new Error(`Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`);
  }
}

export function isAllowedEndpointUrl(value: string): boolean {
  const url = new URL(value);
  if (url.protocol === "https:") return true;
  return isDevelopment && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
}
