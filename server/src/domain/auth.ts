import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const API_KEY_PREFIX = "whsec";

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
