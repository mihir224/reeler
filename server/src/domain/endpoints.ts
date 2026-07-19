import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { endpoints } from "../db/schema.js";
import { generateEndpointSecret } from "./signing.js";

export type EndpointResult = {
  endpoint: typeof endpoints.$inferSelect;
  created: boolean;
  signingSecret: string | null;
};

type DbClient = Pick<typeof db, "select" | "insert" | "update">;

export async function upsertEndpoint(
  appId: string,
  url: string,
  requestedEventTypes: string[],
  tx: DbClient = db,
): Promise<EndpointResult> {
  const [existingEndpoint] = await tx
    .select()
    .from(endpoints)
    .where(and(eq(endpoints.appId, appId), eq(endpoints.url, url)))
    .orderBy(desc(endpoints.createdAt))
    .limit(1);

  if (existingEndpoint) {
    const mergedEventTypes = [...new Set([...existingEndpoint.eventTypes, ...requestedEventTypes])];
    const [updatedEndpoint] = await tx
      .update(endpoints)
      .set({
        eventTypes: mergedEventTypes,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(endpoints.id, existingEndpoint.id))
      .returning();

    await tx
      .update(endpoints)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(endpoints.appId, appId),
          eq(endpoints.url, url),
          ne(endpoints.id, existingEndpoint.id),
        ),
      );

    return { endpoint: updatedEndpoint, created: false, signingSecret: null };
  }

  const secret = generateEndpointSecret();
  const [createdEndpoint] = await tx
    .insert(endpoints)
    .values({
      appId,
      url,
      eventTypes: requestedEventTypes,
      secret,
    })
    .returning();

  return { endpoint: createdEndpoint, created: true, signingSecret: secret };
}

export async function listEndpoints(appId: string) {
  return db
    .select({
      id: endpoints.id,
      url: endpoints.url,
      eventTypes: endpoints.eventTypes,
      isActive: endpoints.isActive,
      createdAt: endpoints.createdAt,
      updatedAt: endpoints.updatedAt,
    })
    .from(endpoints)
    .where(and(eq(endpoints.appId, appId), eq(endpoints.isActive, true)))
    .orderBy(desc(endpoints.createdAt));
}
