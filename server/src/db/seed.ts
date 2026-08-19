import { eq } from "drizzle-orm";
import { db, closeDb } from "./client.js";
import { apiKeys, apps, users } from "./schema.js";
import { generateApiKey, hashApiKey, hashPassword } from "../domain/auth.js";

async function seed(): Promise<void> {
  const apiKey = generateApiKey();
  const [user] = await db
    .insert(users)
    .values({
      email: "demo@reeler.local",
      name: "Demo User",
      passwordHash: hashPassword("password123"),
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  const owner =
    user ??
    (
      await db
        .select()
        .from(users)
        .where(eq(users.email, "demo@reeler.local"))
        .limit(1)
    )[0];

  const [app] = await db
    .insert(apps)
    .values({ name: "Demo App", ownerUserId: owner.id })
    .returning();

  await db.insert(apiKeys).values({
    appId: app.id,
    keyHash: hashApiKey(apiKey),
    label: "Local demo key",
  });

  console.log("Seeded demo app");
  console.log(`Demo user: ${owner.email} / password123`);
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
