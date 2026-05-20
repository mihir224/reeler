import { db, closeDb } from "./client.js";
import { apiKeys, apps } from "./schema.js";
import { generateApiKey, hashApiKey } from "../domain/auth.js";

async function seed(): Promise<void> {
  const apiKey = generateApiKey();
  const [app] = await db
    .insert(apps)
    .values({ name: "Demo App" })
    .returning();

  await db.insert(apiKeys).values({
    appId: app.id,
    keyHash: hashApiKey(apiKey),
    label: "Local demo key",
  });

  console.log("Seeded demo app");
  console.log(`App ID: ${app.id}`);
  console.log(`API Key: ${apiKey}`);
}

seed()
  .then(async () => {
    await closeDb();
  })
  .catch(async (error) => {
    console.error(error);
    await closeDb();
    process.exit(1);
  });
