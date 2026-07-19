import { pool } from "../../src/db/client.js";
import { migrate } from "./migrate.js";

export async function isDatabaseAvailable(): Promise<boolean> {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function setupTestDb(): Promise<void> {
  await migrate();
  await resetDatabase();
}

export async function resetDatabase(): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      replay_audits,
      delivery_attempts,
      deliveries,
      events,
      endpoints,
      api_keys,
      event_catalog,
      user_sessions,
      apps,
      users
    RESTART IDENTITY CASCADE
  `);
}
