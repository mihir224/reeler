import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  deliveries,
  deliveryAttempts,
  endpoints,
  events,
  replayAudits,
} from "../db/schema.js";
import { canReplayDelivery } from "./replay.js";
import { validateEventTypeInCatalog } from "./event-catalog.js";

const allowedDeliveryStatus = ["failed", "pending", "delivered"] as const;

export async function ingestEvent(appId: string, eventType: string, payload: unknown) {
  const catalogValid = await validateEventTypeInCatalog(appId, eventType);
  if (!catalogValid) {
    return { kind: "unknown_event_type" as const };
  }

  const result = await db.transaction(async (tx) => {
    const [createdEvent] = await tx
      .insert(events)
      .values({
        appId,
        eventType,
        payload,
      })
      .returning();

    const matchingEndpoints = await tx
      .select()
      .from(endpoints)
      .where(
        and(
          eq(endpoints.appId, appId),
          eq(endpoints.isActive, true),
          sql`${endpoints.eventTypes} @> ARRAY[${eventType}]::text[]`,
        ),
      )
      .orderBy(desc(endpoints.createdAt));

    const uniqueMatchingEndpoints = Array.from(
      new Map(matchingEndpoints.map((endpoint) => [endpoint.url, endpoint])).values(),
    );

    if (uniqueMatchingEndpoints.length > 0) {
      await tx.insert(deliveries).values(
        uniqueMatchingEndpoints.map((endpoint) => ({
          eventId: createdEvent.id,
          endpointId: endpoint.id,
        })),
      );
    }

    return {
      eventId: createdEvent.id,
      deliveryCount: uniqueMatchingEndpoints.length,
    };
  });

  return { kind: "accepted" as const, ...result };
}

export async function listDeliveriesForApp(
  appId: string,
  status?: string,
) {
  if (status && !allowedDeliveryStatus.includes(status as (typeof allowedDeliveryStatus)[number])) {
    return { kind: "invalid_status" as const };
  }

  const filters: SQL[] = [eq(events.appId, appId)];
  if (status) {
    filters.push(eq(deliveries.status, status as "failed" | "pending" | "delivered"));
  }

  const rows = await db
    .select({
      delivery: deliveries,
      eventType: events.eventType,
      endpointUrl: endpoints.url,
    })
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .innerJoin(endpoints, eq(deliveries.endpointId, endpoints.id))
    .where(and(...filters))
    .orderBy(desc(deliveries.createdAt))
    .limit(100);

  return {
    kind: "ok" as const,
    deliveries: rows.map((row) => ({
      id: row.delivery.id,
      event_id: row.delivery.eventId,
      event_type: row.eventType,
      endpoint_url: row.endpointUrl,
      status: row.delivery.status,
      attempt_count: row.delivery.attemptCount,
      next_retry_at: row.delivery.nextRetryAt,
      last_error: row.delivery.lastError,
      last_response_code: row.delivery.lastResponseCode,
      created_at: row.delivery.createdAt,
    })),
  };
}

export async function replayDeliveryForApp(
  appId: string,
  deliveryId: string,
  triggeredBy: string,
) {
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ delivery: deliveries, event: events })
      .from(deliveries)
      .innerJoin(events, eq(deliveries.eventId, events.id))
      .where(and(eq(deliveries.id, deliveryId), eq(events.appId, appId)))
      .limit(1);

    if (!row) return { kind: "not_found" as const };
    if (!canReplayDelivery(row.delivery.status)) return { kind: "not_failed" as const };

    const [updated] = await tx
      .update(deliveries)
      .set({
        status: "pending",
        attemptCount: 0,
        nextRetryAt: null,
        lastError: null,
        lastResponseCode: null,
        firstAttemptedAt: null,
        deliveredAt: null,
        failedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(deliveries.id, deliveryId))
      .returning();

    await tx.insert(replayAudits).values({
      eventId: row.event.id,
      deliveryId: row.delivery.id,
      replayTriggeredBy: triggeredBy,
    });

    return { kind: "replayed" as const, delivery: updated };
  });

  return result;
}

export async function getEventForApp(appId: string, eventId: string) {
  const [event] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.appId, appId)))
    .limit(1);

  if (!event) return null;

  const eventDeliveries = await db
    .select({
      delivery: deliveries,
      endpointUrl: endpoints.url,
    })
    .from(deliveries)
    .innerJoin(endpoints, eq(deliveries.endpointId, endpoints.id))
    .where(eq(deliveries.eventId, event.id))
    .orderBy(desc(deliveries.createdAt));

  const deliveryIds = eventDeliveries.map((row) => row.delivery.id);
  const attempts =
    deliveryIds.length === 0
      ? []
      : await db
          .select()
          .from(deliveryAttempts)
          .where(inArray(deliveryAttempts.deliveryId, deliveryIds))
          .orderBy(desc(deliveryAttempts.attemptedAt));

  return { event, eventDeliveries, attempts };
}
