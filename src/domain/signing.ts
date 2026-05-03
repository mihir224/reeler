import { createHmac, randomBytes } from "node:crypto";

export function generateEndpointSecret(): string {
  return `whsig_${randomBytes(32).toString("base64url")}`;
}

export function createWebhookSignature(params: {
  secret: string;
  timestamp: number;
  rawBody: string;
}): string {
  const signedPayload = `${params.timestamp}.${params.rawBody}`;
  const digest = createHmac("sha256", params.secret).update(signedPayload).digest("hex");
  return `sha256=${digest}`;
}
