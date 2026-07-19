import sensible from "@fastify/sensible";
import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { config } from "../config.js";
import { closeDb } from "../db/client.js";
import { registerAuthRoutes } from "./auth-routes.js";
import { registerDashboardRoutes } from "./dashboard-routes.js";
import { registerRoutes } from "./routes.js";
import { healthSchema } from "./schemas.js";
import { registerSwagger } from "./swagger.js";

export async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: 300 * 1024,
  });

  await app.register(sensible);
  await app.register(cookie, {
    secret: config.SESSION_SECRET,
    hook: "onRequest",
  });
  await registerSwagger(app);
  await registerAuthRoutes(app);
  await registerDashboardRoutes(app);
  await registerRoutes(app);

  app.get("/health", { schema: healthSchema }, async () => ({ ok: true }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();

  const shutdown = async () => {
    await app.close();
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}
