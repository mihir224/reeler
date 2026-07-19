import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { apps } from "../db/schema.js";

export async function createApp(userId: string, name: string) {
  const [app] = await db
    .insert(apps)
    .values({ name, ownerUserId: userId })
    .returning();

  return app;
}

export async function listAppsForUser(userId: string) {
  return db
    .select({
      id: apps.id,
      name: apps.name,
      createdAt: apps.createdAt,
    })
    .from(apps)
    .where(eq(apps.ownerUserId, userId))
    .orderBy(apps.createdAt);
}

export async function getAppForUser(userId: string, appId: string) {
  const [app] = await db
    .select({
      id: apps.id,
      name: apps.name,
      createdAt: apps.createdAt,
    })
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.ownerUserId, userId)))
    .limit(1);

  return app ?? null;
}
