import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { apiKeys } from "../db/schema.js";
import { generateApiKey, hashApiKey } from "./auth.js";

export async function createApiKey(appId: string, label: string) {
  const rawKey = generateApiKey();
  const [key] = await db
    .insert(apiKeys)
    .values({
      appId,
      keyHash: hashApiKey(rawKey),
      label,
    })
    .returning();

  return { key, rawKey };
}

export async function listApiKeys(appId: string) {
  return db
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      createdAt: apiKeys.createdAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.appId, appId))
    .orderBy(apiKeys.createdAt);
}

export async function revokeApiKey(appId: string, keyId: string) {
  const [key] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.appId, appId), isNull(apiKeys.revokedAt)))
    .returning();

  return key ?? null;
}
