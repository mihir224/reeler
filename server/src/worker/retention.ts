import { pool } from "../db/client.js";

export const RETENTION_DAYS = 7;

export async function runRetentionCleanup(): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `
      DELETE FROM events
      WHERE created_at < now() - ($1::text)::interval
      RETURNING id
    `,
    [`${RETENTION_DAYS} days`],
  );

  return result.rowCount ?? 0;
}
