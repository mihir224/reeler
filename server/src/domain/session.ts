import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { userSessions } from "../db/schema.js";
import { generateSessionToken, hashSessionToken } from "./auth.js";

export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.SESSION_TTL_DAYS);

  await db.insert(userSessions).values({
    userId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt,
  });

  return token;
}

export async function resolveSession(rawToken: string): Promise<{ userId: string; sessionId: string } | null> {
  const [session] = await db
    .select()
    .from(userSessions)
    .where(eq(userSessions.sessionTokenHash, hashSessionToken(rawToken)))
    .limit(1);

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await db.delete(userSessions).where(eq(userSessions.id, session.id));
    }
    return null;
  }

  return { userId: session.userId, sessionId: session.id };
}

export async function revokeSession(rawToken: string): Promise<void> {
  await db
    .delete(userSessions)
    .where(eq(userSessions.sessionTokenHash, hashSessionToken(rawToken)));
}
