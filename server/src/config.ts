import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://webhooks:webhooks@localhost:5432/webhooks_dev"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(10),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-me"),
  SESSION_COOKIE_NAME: z.string().min(1).default("reeler_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

export const config = configSchema.parse(process.env);

export const isDevelopment = config.NODE_ENV === "development";
export const isProduction = config.NODE_ENV === "production";
