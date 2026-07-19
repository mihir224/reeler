import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config, isProduction } from "../config.js";
import { db } from "../db/client.js";
import { apiKeys, apps } from "../db/schema.js";
import { hashApiKey } from "../domain/auth.js";
import { resolveSession } from "../domain/session.js";

export type AuthContext = {
  apiKeyId: string;
  appId: string;
};

export type SessionContext = {
  userId: string;
  sessionId: string;
};

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext;
    session: SessionContext;
  }
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(config.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
    maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(config.SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    path: "/",
  });
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

export async function requireSession(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = request.cookies[config.SESSION_COOKIE_NAME];
  if (!token) {
    await reply.code(401).send({ error: "Not authenticated" });
    return;
  }

  const session = await resolveSession(token);
  if (!session) {
    clearSessionCookie(reply);
    await reply.code(401).send({ error: "Invalid or expired session" });
    return;
  }

  request.session = session;
}

export async function assertAppOwnership(
  userId: string,
  appId: string,
): Promise<{ id: string; name: string } | null> {
  const [app] = await db
    .select({ id: apps.id, name: apps.name })
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.ownerUserId, userId)))
    .limit(1);

  return app ?? null;
}
