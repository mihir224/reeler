import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { apiKeys } from "../db/schema.js";
import { hashApiKey } from "../domain/auth.js";

export type AuthContext = {
  apiKeyId: string;
  appId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    await reply.code(401).send({ error: "Missing bearer token" });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  const [apiKey] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(token)))
    .limit(1);

  if (!apiKey || apiKey.revokedAt !== null) {
    await reply.code(401).send({ error: "Invalid bearer token" });
    return;
  }

  request.auth = {
    apiKeyId: apiKey.id,
    appId: apiKey.appId,
  };
}
