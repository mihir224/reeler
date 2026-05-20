import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Reeler - Event Delivery Platform",
        description:
          "API-first webhook delivery infrastructure with durable ingestion, retries, delivery logs, and replay.",
        version: "0.1.0",
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Local development",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "API key",
          },
        },
      },
      tags: [
        { name: "Health", description: "Service health checks" },
        { name: "Endpoints", description: "Webhook endpoint registration" },
        { name: "Events", description: "Event ingestion and inspection" },
        { name: "Deliveries", description: "Delivery logs and replay" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });

  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());
}
