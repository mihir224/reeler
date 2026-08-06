import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { apiKeys, users } from "../db/schema.js";
import { hashApiKey, verifyUserJwt, type AuthenticatedUserToken } from "../domain/auth.js";

export type ApiKeyAuthContext = {
  apiKeyId: string;
  appId: string;
};

export type UserAuthContext = {
  userId: string;
  email: string;
  name: string;
};

declare module "fastify" {
  interface FastifyRequest {
    auth: ApiKeyAuthContext;
    userAuth: UserAuthContext;
  }
}

export async function requireApiKeyAuth(
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

export async function requireUserAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    await reply.code(401).send({ error: "Missing bearer token" });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  const claims = verifyUserJwt(token);
  if (!claims) {
    await reply.code(401).send({ error: "Invalid bearer token" });
    return;
  }

  const user = await loadUser(claims);
  if (!user) {
    await reply.code(401).send({ error: "User no longer exists" });
    return;
  }

  request.userAuth = {
    userId: user.id,
    email: user.email,
    name: user.name,
  };
}

async function loadUser(claims: AuthenticatedUserToken) {
  const [user] = await db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
  return user;
}
