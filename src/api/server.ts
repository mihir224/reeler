import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { config } from "../config.js";
import { closeDb } from "../db/client.js";
import { registerRoutes } from "./routes.js";

export async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: 300 * 1024,
  });

  await app.register(sensible);
  await registerRoutes(app);

  app.get("/health", async () => ({ ok: true }));

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
