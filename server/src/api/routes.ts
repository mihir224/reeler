import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import {
  assertPayloadSize,
  createEndpointSchema,
  createEventSchema,
  isAllowedEndpointUrl,
} from "../domain/validation.js";
import { ingestEvent, listDeliveriesForApp, replayDeliveryForApp, getEventForApp } from "../domain/deliveries.js";
import { upsertEndpoint } from "../domain/endpoints.js";
import { requireAuth } from "./auth.js";
import {
  createEndpointRouteSchema,
  createEventRouteSchema,
  getEventRouteSchema,
  listDeliveriesRouteSchema,
  replayDeliveryRouteSchema,
} from "./schemas.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (authed) => {
    authed.addHook("preHandler", requireAuth);

    authed.post("/v1/events", { schema: createEventRouteSchema }, async (request, reply) => {
      const parsed = createEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      try {
        assertPayloadSize(parsed.data.payload);
      } catch (error) {
        return reply.code(413).send({ error: error instanceof Error ? error.message : "Payload too large" });
      }

      const result = await ingestEvent(
        request.auth.appId,
        parsed.data.event_type,
        parsed.data.payload,
      );

      if (result.kind === "unknown_event_type") {
        return reply.code(400).send({ error: "Unknown event type for this app" });
      }

      return reply.code(202).send({
        event_id: result.eventId,
        delivery_count: result.deliveryCount,
      });
    });

    authed.post("/v1/endpoints", { schema: createEndpointRouteSchema }, async (request, reply) => {
      const parsed = createEndpointSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      if (!isAllowedEndpointUrl(parsed.data.url)) {
        return reply.code(400).send({
          error: "Endpoint URL must use https, except http://localhost is allowed in development",
        });
      }

      const requestedEventTypes = [...new Set(parsed.data.event_types)];
      const { endpoint, created } = await db.transaction((tx) =>
        upsertEndpoint(request.auth.appId, parsed.data.url, requestedEventTypes, tx),
      );

      return reply.code(created ? 201 : 200).send({
        id: endpoint.id,
        url: endpoint.url,
        event_types: endpoint.eventTypes,
        is_active: endpoint.isActive,
        created_at: endpoint.createdAt,
        updated_at: endpoint.updatedAt,
        already_existed: !created,
      });
    });

    authed.get("/v1/events/:event_id", { schema: getEventRouteSchema }, async (request, reply) => {
      const { event_id: eventId } = request.params as { event_id: string };
      const result = await getEventForApp(request.auth.appId, eventId);

      if (!result) return reply.code(404).send({ error: "Event not found" });

      const { event, eventDeliveries, attempts } = result;

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

    authed.get("/v1/deliveries", { schema: listDeliveriesRouteSchema }, async (request, reply) => {
      const query = request.query as { status?: string };
      const result = await listDeliveriesForApp(request.auth.appId, query.status);

      if (result.kind === "invalid_status") {
        return reply.code(400).send({ error: "Invalid status filter" });
      }

      return reply.send({ deliveries: result.deliveries });
    });

    authed.post(
      "/v1/deliveries/:delivery_id/replay",
      { schema: replayDeliveryRouteSchema },
      async (request, reply) => {
        const { delivery_id: deliveryId } = request.params as { delivery_id: string };
        const result = await replayDeliveryForApp(
          request.auth.appId,
          deliveryId,
          `api_key:${request.auth.apiKeyId}`,
        );

        if (result.kind === "not_found") return reply.code(404).send({ error: "Delivery not found" });
        if (result.kind === "not_failed") {
          return reply.code(409).send({ error: "Only failed deliveries can be replayed" });
        }

        return reply.send({
          delivery_id: result.delivery.id,
          event_id: result.delivery.eventId,
          status: result.delivery.status,
        });
      },
    );
  });
}
