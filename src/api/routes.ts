import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  deliveries,
  deliveryAttempts,
  endpoints,
  events,
  replayAudits,
} from "../db/schema.js";
import { generateEndpointSecret } from "../domain/signing.js";
import {
  assertPayloadSize,
  createEndpointSchema,
  createEventSchema,
  isAllowedEndpointUrl,
} from "../domain/validation.js";
import { canReplayDelivery } from "../domain/replay.js";
import { requireAuth } from "./auth.js";

const allowedDeliveryStatus = ["failed", "pending", "delivered"] as const;

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (authed) => {
    authed.addHook("preHandler", requireAuth);

    authed.post("/v1/events", async (request, reply) => {
    const parsed = createEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    try {
      assertPayloadSize(parsed.data.payload);
    } catch (error) {
      return reply.code(413).send({ error: error instanceof Error ? error.message : "Payload too large" });
    }

    const result = await db.transaction(async (tx) => {
      const [createdEvent] = await tx
        .insert(events)
        .values({
          appId: request.auth.appId,
          eventType: parsed.data.event_type,
          payload: parsed.data.payload,
        })
        .returning();

      const matchingEndpoints = await tx
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.appId, request.auth.appId),
            eq(endpoints.isActive, true),
            sql`${endpoints.eventTypes} @> ARRAY[${parsed.data.event_type}]::text[]`,
          ),
        );

      if (matchingEndpoints.length > 0) {
        await tx.insert(deliveries).values(
          matchingEndpoints.map((endpoint) => ({
            eventId: createdEvent.id,
            endpointId: endpoint.id,
          })),
        );
      }

      return {
        eventId: createdEvent.id,
        deliveryCount: matchingEndpoints.length,
      };
    });

    return reply.code(202).send({
      event_id: result.eventId,
      delivery_count: result.deliveryCount,
    });
    });

    authed.post("/v1/endpoints", async (request, reply) => {
    const parsed = createEndpointSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    if (!isAllowedEndpointUrl(parsed.data.url)) {
      return reply.code(400).send({
        error: "Endpoint URL must use https, except http://localhost is allowed in development",
      });
    }

    const [endpoint] = await db
      .insert(endpoints)
      .values({
        appId: request.auth.appId,
        url: parsed.data.url,
        eventTypes: [...new Set(parsed.data.event_types)],
        secret: generateEndpointSecret(),
      })
      .returning();

    return reply.code(201).send({
      id: endpoint.id,
      url: endpoint.url,
      event_types: endpoint.eventTypes,
      is_active: endpoint.isActive,
      created_at: endpoint.createdAt,
    });
    });

    authed.get("/v1/events/:event_id", async (request, reply) => {
    const { event_id: eventId } = request.params as { event_id: string };
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.appId, request.auth.appId)))
      .limit(1);

    if (!event) return reply.code(404).send({ error: "Event not found" });

    const eventDeliveries = await db
      .select({
        delivery: deliveries,
        endpointUrl: endpoints.url,
        endpointEventTypes: endpoints.eventTypes,
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

    return reply.send({
      event: {
        id: event.id,
        event_type: event.eventType,
        payload: event.payload,
        status: event.status,
        created_at: event.createdAt,
      },
      deliveries: eventDeliveries.map((row) => ({
        id: row.delivery.id,
        endpoint_url: row.endpointUrl,
        status: row.delivery.status,
        attempt_count: row.delivery.attemptCount,
        next_retry_at: row.delivery.nextRetryAt,
        last_error: row.delivery.lastError,
        last_response_code: row.delivery.lastResponseCode,
        delivered_at: row.delivery.deliveredAt,
        failed_at: row.delivery.failedAt,
      })),
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        delivery_id: attempt.deliveryId,
        attempt_number: attempt.attemptNumber,
        status: attempt.status,
        response_code: attempt.responseCode,
        error_message: attempt.errorMessage,
        latency_ms: attempt.latencyMs,
        attempted_at: attempt.attemptedAt,
      })),
    });
    });

    authed.get("/v1/deliveries", async (request, reply) => {
    const query = request.query as { status?: string };
    if (query.status && !allowedDeliveryStatus.includes(query.status as (typeof allowedDeliveryStatus)[number])) {
      return reply.code(400).send({ error: "Invalid status filter" });
    }

    const filters: SQL[] = [eq(events.appId, request.auth.appId)];
    if (query.status) {
      filters.push(eq(deliveries.status, query.status as "failed" | "pending" | "delivered"));
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

    return reply.send({
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
    });
    });

    authed.post("/v1/deliveries/:delivery_id/replay", async (request, reply) => {
    const { delivery_id: deliveryId } = request.params as { delivery_id: string };

    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ delivery: deliveries, event: events })
        .from(deliveries)
        .innerJoin(events, eq(deliveries.eventId, events.id))
        .where(and(eq(deliveries.id, deliveryId), eq(events.appId, request.auth.appId)))
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
        replayTriggeredBy: `api_key:${request.auth.apiKeyId}`,
      });

      return { kind: "replayed" as const, delivery: updated };
    });

    if (result.kind === "not_found") return reply.code(404).send({ error: "Delivery not found" });
    if (result.kind === "not_failed") {
      return reply.code(409).send({ error: "Only failed deliveries can be replayed" });
    }

    return reply.send({
      delivery_id: result.delivery.id,
      event_id: result.delivery.eventId,
      status: result.delivery.status,
    });
    });
  });
}
