import { and, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  apiKeys,
  apps,
  deliveries,
  deliveryAttempts,
  endpoints,
  eventCatalog,
  events,
  replayAudits,
  users,
} from "../db/schema.js";
import { generateApiKey, hashApiKey, hashPassword, signUserJwt, verifyPassword } from "../domain/auth.js";
import { generateEndpointSecret } from "../domain/signing.js";
import {
  assertPayloadSize,
  createEndpointSchema,
  createEventSchema,
  isAllowedEndpointUrl,
} from "../domain/validation.js";
import { canReplayDelivery } from "../domain/replay.js";
import { requireApiKeyAuth, requireUserAuth } from "./auth.js";
import {
  createEndpointRouteSchema,
  createEventRouteSchema,
  getEventRouteSchema,
  listDeliveriesRouteSchema,
  replayDeliveryRouteSchema,
} from "./schemas.js";

const allowedDeliveryStatus = ["failed", "pending", "delivered"] as const;

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const createDashboardAppSchema = z.object({
  name: z.string().min(1).max(120),
  api_key_label: z.string().min(1).max(120).default("Default key"),
});

const createCatalogEventSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().min(1).max(280),
});

const createDashboardEndpointSchema = createEndpointSchema.extend({
  label: z.string().min(1).max(120).optional(),
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/signup", async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const existingUser = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (existingUser.length > 0) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const [user] = await db
      .insert(users)
      .values({
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash: hashPassword(parsed.data.password),
      })
      .returning();

    return reply.code(201).send({
      token: signUserJwt({ sub: user.id, email: user.email, name: user.name }),
      user: serializeUser(user),
    });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    return reply.send({
      token: signUserJwt({ sub: user.id, email: user.email, name: user.name }),
      user: serializeUser(user),
    });
  });

  app.post("/auth/logout", async (_request, reply) => {
    return reply.code(204).send();
  });

  await app.register(async (userAuthed) => {
    userAuthed.addHook("preHandler", requireUserAuth);

    userAuthed.get("/auth/me", async (request) => ({
      user: {
        id: request.userAuth.userId,
        email: request.userAuth.email,
        name: request.userAuth.name,
      },
    }));

    userAuthed.get("/dashboard/apps", async (request) => {
      const rows = await db
        .select()
        .from(apps)
        .where(eq(apps.ownerUserId, request.userAuth.userId))
        .orderBy(desc(apps.createdAt));

      return {
        apps: rows.map((row) => ({
          id: row.id,
          name: row.name,
          created_at: row.createdAt,
        })),
      };
    });

    userAuthed.post("/dashboard/apps", async (request, reply) => {
      const parsed = createDashboardAppSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      const apiKey = generateApiKey();
      const result = await db.transaction(async (tx) => {
        const [createdApp] = await tx
          .insert(apps)
          .values({
            ownerUserId: request.userAuth.userId,
            name: parsed.data.name,
          })
          .returning();

        const [createdKey] = await tx
          .insert(apiKeys)
          .values({
            appId: createdApp.id,
            keyHash: hashApiKey(apiKey),
            label: parsed.data.api_key_label,
          })
          .returning();

        return { createdApp, createdKey };
      });

      return reply.code(201).send({
        app: {
          id: result.createdApp.id,
          name: result.createdApp.name,
          created_at: result.createdApp.createdAt,
        },
        credentials: {
          id: result.createdKey.id,
          label: result.createdKey.label,
          api_key: apiKey,
        },
      });
    });

    userAuthed.get("/dashboard/apps/:app_id", async (request, reply) => {
      const appRecord = await requireOwnedApp(reply, request.userAuth.userId, (request.params as { app_id: string }).app_id);
      if (!appRecord) return;

      const [[catalogCount], [endpointCount], [eventCount], [failedCount]] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(eventCatalog).where(eq(eventCatalog.appId, appRecord.id)),
        db.select({ count: sql<number>`count(*)::int` }).from(endpoints).where(eq(endpoints.appId, appRecord.id)),
        db.select({ count: sql<number>`count(*)::int` }).from(events).where(eq(events.appId, appRecord.id)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(deliveries)
          .innerJoin(events, eq(deliveries.eventId, events.id))
          .where(and(eq(events.appId, appRecord.id), eq(deliveries.status, "failed"))),
      ]);

      return {
        app: {
          id: appRecord.id,
          name: appRecord.name,
          created_at: appRecord.createdAt,
        },
        stats: {
          event_catalog_count: catalogCount.count,
          endpoint_count: endpointCount.count,
          event_count: eventCount.count,
          failed_delivery_count: failedCount.count,
        },
      };
    });

    userAuthed.get("/dashboard/apps/:app_id/events", async (request, reply) => {
      const appRecord = await requireOwnedApp(reply, request.userAuth.userId, (request.params as { app_id: string }).app_id);
      if (!appRecord) return;

      const rows = await db
        .select()
        .from(eventCatalog)
        .where(eq(eventCatalog.appId, appRecord.id))
        .orderBy(eventCatalog.name);

      return {
        events: rows.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        })),
      };
    });

    userAuthed.post("/dashboard/apps/:app_id/events", async (request, reply) => {
      const appRecord = await requireOwnedApp(reply, request.userAuth.userId, (request.params as { app_id: string }).app_id);
      if (!appRecord) return;

      const parsed = z.array(createCatalogEventSchema).min(1).max(100).safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      const eventNames = parsed.data.map((item) => item.name);
      const existing = await db
        .select()
        .from(eventCatalog)
        .where(and(eq(eventCatalog.appId, appRecord.id), inArray(eventCatalog.name, eventNames)));

      const existingByName = new Map(existing.map((item) => [item.name, item]));
      const now = new Date();

      const createdOrUpdated = await db.transaction(async (tx) => {
        const results = [];
        for (const item of parsed.data) {
          const found = existingByName.get(item.name);
          if (found) {
            const [updated] = await tx
              .update(eventCatalog)
              .set({ description: item.description, updatedAt: now })
              .where(eq(eventCatalog.id, found.id))
              .returning();
            results.push(updated);
          } else {
            const [created] = await tx
              .insert(eventCatalog)
              .values({ appId: appRecord.id, name: item.name, description: item.description })
              .returning();
            results.push(created);
          }
        }
        return results;
      });

      return reply.code(201).send({
        events: createdOrUpdated.map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        })),
      });
    });

    userAuthed.get("/dashboard/apps/:app_id/endpoints", async (request, reply) => {
      const appRecord = await requireOwnedApp(reply, request.userAuth.userId, (request.params as { app_id: string }).app_id);
      if (!appRecord) return;

      const rows = await db
        .select()
        .from(endpoints)
        .where(eq(endpoints.appId, appRecord.id))
        .orderBy(desc(endpoints.createdAt));

      return {
        endpoints: rows.map((row) => ({
          id: row.id,
          url: row.url,
          event_types: row.eventTypes,
          is_active: row.isActive,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        })),
      };
    });

    userAuthed.post("/dashboard/apps/:app_id/endpoints", async (request, reply) => {
      const appRecord = await requireOwnedApp(reply, request.userAuth.userId, (request.params as { app_id: string }).app_id);
      if (!appRecord) return;

      const parsed = createDashboardEndpointSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      const validationError = await validateEndpointRegistration(appRecord.id, parsed.data);
      if (validationError) {
        return reply.code(validationError.code).send({ error: validationError.message });
      }

      const requestedEventTypes = [...new Set(parsed.data.event_types)];
      const { endpoint, created } = await db.transaction(async (tx) => {
        const [existingEndpoint] = await tx
          .select()
          .from(endpoints)
          .where(and(eq(endpoints.appId, appRecord.id), eq(endpoints.url, parsed.data.url)))
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

          return { endpoint: updatedEndpoint, created: false };
        }

        const [createdEndpoint] = await tx
          .insert(endpoints)
          .values({
            appId: appRecord.id,
            url: parsed.data.url,
            eventTypes: requestedEventTypes,
            secret: generateEndpointSecret(),
          })
          .returning();

        return { endpoint: createdEndpoint, created: true };
      });

      return reply.code(created ? 201 : 200).send({
        endpoint: {
          id: endpoint.id,
          url: endpoint.url,
          event_types: endpoint.eventTypes,
          is_active: endpoint.isActive,
          created_at: endpoint.createdAt,
          updated_at: endpoint.updatedAt,
        },
        verification: created
          ? {
              scheme: "hmac_sha256",
              signing_secret: endpoint.secret,
              signature_header: "X-Signature",
              timestamp_header: "X-Timestamp",
              event_id_header: "X-Event-ID",
            }
          : null,
      });
    });

    userAuthed.get("/dashboard/apps/:app_id/deliveries", async (request, reply) => {
      const appRecord = await requireOwnedApp(reply, request.userAuth.userId, (request.params as { app_id: string }).app_id);
      if (!appRecord) return;

      const query = request.query as { status?: string };
      if (query.status && !allowedDeliveryStatus.includes(query.status as (typeof allowedDeliveryStatus)[number])) {
        return reply.code(400).send({ error: "Invalid status filter" });
      }

      const filters: SQL[] = [eq(events.appId, appRecord.id)];
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

      return {
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
    });

    userAuthed.post("/dashboard/deliveries/:delivery_id/replay", async (request, reply) => {
      const { delivery_id: deliveryId } = request.params as { delivery_id: string };

      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ delivery: deliveries, event: events, app: apps })
          .from(deliveries)
          .innerJoin(events, eq(deliveries.eventId, events.id))
          .innerJoin(apps, eq(events.appId, apps.id))
          .where(and(eq(deliveries.id, deliveryId), eq(apps.ownerUserId, request.userAuth.userId)))
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
          replayTriggeredBy: `user:${request.userAuth.userId}`,
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

  await app.register(async (authed) => {
    authed.addHook("preHandler", requireApiKeyAuth);

    authed.post("/v1/events", { schema: createEventRouteSchema }, async (request, reply) => {
      const parsed = createEventSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      const allowedEventType = await hasEventType(request.auth.appId, parsed.data.event_type);
      if (!allowedEventType) {
        return reply.code(400).send({ error: "Event type is not registered in the event catalog" });
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

      const validationError = await validateEndpointRegistration(request.auth.appId, parsed.data);
      if (validationError) {
        return reply.code(validationError.code).send({ error: validationError.message });
      }

      const requestedEventTypes = [...new Set(parsed.data.event_types)];
      const { endpoint, created } = await db.transaction(async (tx) => {
        const [existingEndpoint] = await tx
          .select()
          .from(endpoints)
          .where(and(eq(endpoints.appId, request.auth.appId), eq(endpoints.url, parsed.data.url)))
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
                eq(endpoints.appId, request.auth.appId),
                eq(endpoints.url, parsed.data.url),
                ne(endpoints.id, existingEndpoint.id),
              ),
            );

          return { endpoint: updatedEndpoint, created: false };
        }

        const [createdEndpoint] = await tx
          .insert(endpoints)
          .values({
            appId: request.auth.appId,
            url: parsed.data.url,
            eventTypes: requestedEventTypes,
            secret: generateEndpointSecret(),
          })
          .returning();

        return { endpoint: createdEndpoint, created: true };
      });

      return reply.code(created ? 201 : 200).send({
        endpoint: {
          id: endpoint.id,
          url: endpoint.url,
          event_types: endpoint.eventTypes,
          is_active: endpoint.isActive,
          created_at: endpoint.createdAt,
          updated_at: endpoint.updatedAt,
        },
        verification: created
          ? {
              scheme: "hmac_sha256",
              signing_secret: endpoint.secret,
              signature_header: "X-Signature",
              timestamp_header: "X-Timestamp",
              event_id_header: "X-Event-ID",
            }
          : null,
      });
    });

    authed.get("/v1/events/:event_id", { schema: getEventRouteSchema }, async (request, reply) => {
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

    authed.get("/v1/deliveries", { schema: listDeliveriesRouteSchema }, async (request, reply) => {
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

    authed.post("/v1/deliveries/:delivery_id/replay", { schema: replayDeliveryRouteSchema }, async (request, reply) => {
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

function serializeUser(user: { id: string; email: string; name: string; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: user.createdAt,
  };
}

async function requireOwnedApp(reply: FastifyReply, userId: string, appId: string) {
  const [appRecord] = await db
    .select()
    .from(apps)
    .where(and(eq(apps.id, appId), eq(apps.ownerUserId, userId)))
    .limit(1);

  if (!appRecord) {
    await reply.code(404).send({ error: "App not found" });
    return null;
  }

  return appRecord;
}

async function validateEndpointRegistration(
  appId: string,
  input: z.infer<typeof createEndpointSchema>,
): Promise<{ code: 400; message: string } | null> {
  if (!isAllowedEndpointUrl(input.url)) {
    return {
      code: 400,
      message: "Endpoint URL must use https, except http://localhost is allowed in development",
    };
  }

  const requestedEventTypes = [...new Set(input.event_types)];
  const catalogRows = await db
    .select({ name: eventCatalog.name })
    .from(eventCatalog)
    .where(and(eq(eventCatalog.appId, appId), inArray(eventCatalog.name, requestedEventTypes)));

  const knownEventTypes = new Set(catalogRows.map((row) => row.name));
  const missingEventTypes = requestedEventTypes.filter((eventType) => !knownEventTypes.has(eventType));
  if (missingEventTypes.length > 0) {
    return {
      code: 400,
      message: `Unknown event types: ${missingEventTypes.join(", ")}`,
    };
  }

  return null;
}

async function hasEventType(appId: string, eventType: string): Promise<boolean> {
  const [row] = await db
    .select({ id: eventCatalog.id })
    .from(eventCatalog)
    .where(and(eq(eventCatalog.appId, appId), eq(eventCatalog.name, eventType)))
    .limit(1);

  return Boolean(row);
}
