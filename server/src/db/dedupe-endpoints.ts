import { pool, closeDb } from "./client.js";

async function dedupeEndpoints(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(`
      WITH duplicate_groups AS (
        SELECT app_id, url, min(id::text)::uuid AS keep_id, array_agg(id) AS endpoint_ids
        FROM endpoints
        GROUP BY app_id, url
        HAVING count(*) > 1
      ),
      duplicate_ids AS (
        SELECT keep_id, unnest(endpoint_ids) AS duplicate_id
        FROM duplicate_groups
      ),
      rewired_deliveries AS (
        UPDATE deliveries d
        SET endpoint_id = duplicate_ids.keep_id,
            updated_at = now()
        FROM duplicate_ids
        WHERE d.endpoint_id = duplicate_ids.duplicate_id
          AND d.endpoint_id <> duplicate_ids.keep_id
        RETURNING d.id
      ),
      deleted_endpoints AS (
        DELETE FROM endpoints e
        USING duplicate_ids
        WHERE e.id = duplicate_ids.duplicate_id
          AND e.id <> duplicate_ids.keep_id
        RETURNING e.id
      )
      SELECT
        (SELECT count(*) FROM rewired_deliveries) AS rewired_deliveries,
        (SELECT count(*) FROM deleted_endpoints) AS deleted_endpoints
    `);

    await client.query("COMMIT");
    const row = result.rows[0] ?? { rewired_deliveries: 0, deleted_endpoints: 0 };
    console.log(`Rewired deliveries: ${row.rewired_deliveries}`);
    console.log(`Deleted duplicate endpoints: ${row.deleted_endpoints}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

dedupeEndpoints()
  .then(async () => {
    await closeDb();
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
