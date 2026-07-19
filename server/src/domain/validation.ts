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

export const signupSchema = z.object({
  name: z.string().min(1).max(128),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export const createAppSchema = z.object({
  name: z.string().min(1).max(128),
});

export const createCatalogEventSchema = z.object({
  name: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_]*$/, "Use lowercase snake_case"),
  description: z.string().max(512).optional().default(""),
});

export const createApiKeySchema = z.object({
  label: z.string().min(1).max(128),
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
