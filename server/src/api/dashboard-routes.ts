import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../domain/api-keys.js";
import { createApp, listAppsForUser } from "../domain/apps.js";
import { listDeliveriesForApp, replayDeliveryForApp } from "../domain/deliveries.js";
import { createCatalogEvent, listCatalogEvents, validateEventTypesInCatalog } from "../domain/event-catalog.js";
import { listEndpoints, upsertEndpoint } from "../domain/endpoints.js";
import {
  createApiKeySchema,
  createAppSchema,
  createCatalogEventSchema,
  createEndpointSchema,
  isAllowedEndpointUrl,
} from "../domain/validation.js";
import { assertAppOwnership, requireSession } from "./auth.js";
import {
  createDashboardApiKeyRouteSchema,
  createDashboardAppRouteSchema,
  createDashboardCatalogEventRouteSchema,
  createDashboardEndpointRouteSchema,
  listDashboardApiKeysRouteSchema,
  listDashboardAppsRouteSchema,
  listDashboardCatalogEventsRouteSchema,
  listDashboardDeliveriesRouteSchema,
  listDashboardEndpointsRouteSchema,
  replayDashboardDeliveryRouteSchema,
  revokeDashboardApiKeyRouteSchema,
} from "./schemas.js";

const verificationHeaders = {
  scheme: "hmac_sha256",
  signature_header: "X-Signature",
  timestamp_header: "X-Timestamp",
  event_id_header: "X-Event-ID",
} as const;

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (dashboard) => {
    dashboard.addHook("preHandler", requireSession);

    dashboard.get("/dashboard/apps", { schema: listDashboardAppsRouteSchema }, async (request, reply) => {
      const apps = await listAppsForUser(request.session.userId);
      return reply.send({
        apps: apps.map((app) => ({
          id: app.id,
          name: app.name,
          created_at: app.createdAt,
        })),
      });
    });

    dashboard.post("/dashboard/apps", { schema: createDashboardAppRouteSchema }, async (request, reply) => {
      const parsed = createAppSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
      }

      const app = await createApp(request.session.userId, parsed.data.name);
      return reply.code(201).send({
        id: app.id,
        name: app.name,
        created_at: app.createdAt,
      });
    });

    dashboard.get(
      "/dashboard/apps/:app_id/events",
      { schema: listDashboardCatalogEventsRouteSchema },
      async (request, reply) => {
        const { app_id: appId } = request.params as { app_id: string };
        const app = await assertAppOwnership(request.session.userId, appId);
        if (!app) return reply.code(404).send({ error: "App not found" });

        const events = await listCatalogEvents(appId);
        return reply.send({
          events: events.map((event) => ({
            id: event.id,
            name: event.name,
            description: event.description,
            created_at: event.createdAt,
            updated_at: event.updatedAt,
          })),
        });
      },
    );

    dashboard.post(
      "/dashboard/apps/:app_id/events",
      { schema: createDashboardCatalogEventRouteSchema },
      async (request, reply) => {
        const { app_id: appId } = request.params as { app_id: string };
        const app = await assertAppOwnership(request.session.userId, appId);
        if (!app) return reply.code(404).send({ error: "App not found" });

        const parsed = createCatalogEventSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
        }

        try {
          const event = await createCatalogEvent(appId, parsed.data.name, parsed.data.description ?? "");
          return reply.code(201).send({
            id: event.id,
            name: event.name,
            description: event.description,
            created_at: event.createdAt,
            updated_at: event.updatedAt,
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes("unique")) {
            return reply.code(409).send({ error: "Event type already exists in catalog" });
          }
          throw error;
        }
      },
    );

    dashboard.get(
      "/dashboard/apps/:app_id/endpoints",
      { schema: listDashboardEndpointsRouteSchema },
      async (request, reply) => {
        const { app_id: appId } = request.params as { app_id: string };
        const app = await assertAppOwnership(request.session.userId, appId);
        if (!app) return reply.code(404).send({ error: "App not found" });

        const rows = await listEndpoints(appId);
        return reply.send({
          endpoints: rows.map((endpoint) => ({
            id: endpoint.id,
            url: endpoint.url,
            event_types: endpoint.eventTypes,
            is_active: endpoint.isActive,
            created_at: endpoint.createdAt,
            updated_at: endpoint.updatedAt,
          })),
        });
      },
    );

    dashboard.post(
      "/dashboard/apps/:app_id/endpoints",
      { schema: createDashboardEndpointRouteSchema },
      async (request, reply) => {
        const { app_id: appId } = request.params as { app_id: string };
        const app = await assertAppOwnership(request.session.userId, appId);
        if (!app) return reply.code(404).send({ error: "App not found" });

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
        const catalogCheck = await validateEventTypesInCatalog(appId, requestedEventTypes);
        if (!catalogCheck.valid) {
          return reply.code(400).send({
            error: "Unknown event types",
            unknown_event_types: catalogCheck.unknown,
          });
        }

        const { endpoint, created, signingSecret } = await db.transaction((tx) =>
          upsertEndpoint(appId, parsed.data.url, requestedEventTypes, tx),
        );

        const response: Record<string, unknown> = {
          endpoint: {
            id: endpoint.id,
            url: endpoint.url,
            event_types: endpoint.eventTypes,
            is_active: endpoint.isActive,
            created_at: endpoint.createdAt,
            updated_at: endpoint.updatedAt,
            already_existed: !created,
          },
        };

        if (created && signingSecret) {
          response.verification = {
            ...verificationHeaders,
            signing_secret: signingSecret,
          };
        }

        return reply.code(created ? 201 : 200).send(response);
      },
    );

    dashboard.get(
      "/dashboard/apps/:app_id/api-keys",
      { schema: listDashboardApiKeysRouteSchema },
      async (request, reply) => {
        const { app_id: appId } = request.params as { app_id: string };
        const app = await assertAppOwnership(request.session.userId, appId);
        if (!app) return reply.code(404).send({ error: "App not found" });

        const keys = await listApiKeys(appId);
        return reply.send({
          api_keys: keys.map((key) => ({
            id: key.id,
            label: key.label,
            created_at: key.createdAt,
            revoked_at: key.revokedAt,
          })),
        });
      },
    );

    dashboard.post(
      "/dashboard/apps/:app_id/api-keys",
      { schema: createDashboardApiKeyRouteSchema },
      async (request, reply) => {
        const { app_id: appId } = request.params as { app_id: string };
        const app = await assertAppOwnership(request.session.userId, appId);
        if (!app) return reply.code(404).send({ error: "App not found" });

        const parsed = createApiKeySchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
        }

        const { key, rawKey } = await createApiKey(appId, parsed.data.label);
        return reply.code(201).send({
          id: key.id,
          label: key.label,
          api_key: rawKey,
        });
      },
    );

    dashboard.post(
      "/dashboard/apps/:app_id/api-keys/:key_id/revoke",
      { schema: revokeDashboardApiKeyRouteSchema },
      async (request, reply) => {
        const { app_id: appId, key_id: keyId } = request.params as {
          app_id: string;
          key_id: string;
        };
        const app = await assertAppOwnership(request.session.userId, appId);
        if (!app) return reply.code(404).send({ error: "App not found" });

        const key = await revokeApiKey(appId, keyId);
        if (!key) return reply.code(404).send({ error: "API key not found or already revoked" });

        return reply.send({
          id: key.id,
          label: key.label,
          revoked_at: key.revokedAt,
        });
      },
    );

    dashboard.get(
      "/dashboard/apps/:app_id/deliveries",
      { schema: listDashboardDeliveriesRouteSchema },
      async (request, reply) => {
        const { app_id: appId } = request.params as { app_id: string };
        const app = await assertAppOwnership(request.session.userId, appId);
        if (!app) return reply.code(404).send({ error: "App not found" });

        const query = request.query as { status?: string };
        const result = await listDeliveriesForApp(appId, query.status);
        if (result.kind === "invalid_status") {
          return reply.code(400).send({ error: "Invalid status filter" });
        }

        return reply.send({ deliveries: result.deliveries });
      },
    );

    dashboard.post(
      "/dashboard/deliveries/:delivery_id/replay",
      { schema: replayDashboardDeliveryRouteSchema },
      async (request, reply) => {
        const { delivery_id: deliveryId } = request.params as { delivery_id: string };

        const apps = await listAppsForUser(request.session.userId);
        let replayed: Awaited<ReturnType<typeof replayDeliveryForApp>> | null = null;

        for (const app of apps) {
          const result = await replayDeliveryForApp(
            app.id,
            deliveryId,
            `user:${request.session.userId}`,
          );
          if (result.kind === "replayed") {
            replayed = result;
            break;
          }
          if (result.kind === "not_failed") {
            return reply.code(409).send({ error: "Only failed deliveries can be replayed" });
          }
        }

        if (!replayed || replayed.kind !== "replayed") {
          return reply.code(404).send({ error: "Delivery not found" });
        }

        return reply.send({
          delivery_id: replayed.delivery.id,
          event_id: replayed.delivery.eventId,
          status: replayed.delivery.status,
        });
      },
    );
  });
}
