import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { eventCatalog } from "../db/schema.js";

export async function createCatalogEvent(appId: string, name: string, description: string) {
  const [entry] = await db
    .insert(eventCatalog)
    .values({ appId, name, description })
    .returning();

  return entry;
}

export async function listCatalogEvents(appId: string) {
  return db
    .select({
      id: eventCatalog.id,
      name: eventCatalog.name,
      description: eventCatalog.description,
      createdAt: eventCatalog.createdAt,
      updatedAt: eventCatalog.updatedAt,
    })
    .from(eventCatalog)
    .where(eq(eventCatalog.appId, appId))
    .orderBy(eventCatalog.name);
}

export async function catalogHasEntries(appId: string): Promise<boolean> {
  const [entry] = await db
    .select({ id: eventCatalog.id })
    .from(eventCatalog)
    .where(eq(eventCatalog.appId, appId))
    .limit(1);

  return Boolean(entry);
}

export async function validateEventTypesInCatalog(
  appId: string,
  eventTypes: string[],
): Promise<{ valid: true } | { valid: false; unknown: string[] }> {
  if (eventTypes.length === 0) return { valid: true };

  const entries = await db
    .select({ name: eventCatalog.name })
    .from(eventCatalog)
    .where(eq(eventCatalog.appId, appId));

  if (entries.length === 0) return { valid: true };

  const known = new Set(entries.map((entry) => entry.name));
  const unknown = eventTypes.filter((type) => !known.has(type));

  if (unknown.length > 0) return { valid: false, unknown };
  return { valid: true };
}

export async function validateEventTypeInCatalog(
  appId: string,
  eventType: string,
): Promise<boolean> {
  const hasEntries = await catalogHasEntries(appId);
  if (!hasEntries) return true;

  const [entry] = await db
    .select({ id: eventCatalog.id })
    .from(eventCatalog)
    .where(and(eq(eventCatalog.appId, appId), eq(eventCatalog.name, eventType)))
    .limit(1);

  return Boolean(entry);
}

export async function listCatalogEventNames(appId: string): Promise<string[]> {
  const entries = await db
    .select({ name: eventCatalog.name })
    .from(eventCatalog)
    .where(eq(eventCatalog.appId, appId));

  return entries.map((entry) => entry.name);
}

export async function validateEventTypesExist(appId: string, eventTypes: string[]) {
  const entries = await db
    .select({ name: eventCatalog.name })
    .from(eventCatalog)
    .where(and(eq(eventCatalog.appId, appId), inArray(eventCatalog.name, eventTypes)));

  const known = new Set(entries.map((entry) => entry.name));
  const unknown = eventTypes.filter((type) => !known.has(type));
  return unknown;
}
