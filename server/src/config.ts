import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://webhooks:webhooks@localhost:5432/webhooks_dev"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  JWT_SECRET: z.string().min(32).default("dev_jwt_secret_that_should_be_overridden_123"),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(10),
});

export const config = configSchema.parse(process.env);

export const isDevelopment = config.NODE_ENV === "development";
