import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { db, closeDb } from "../src/db/client.js";
import { apiKeys, apps } from "../src/db/schema.js";
import { generateApiKey, hashApiKey } from "../src/domain/auth.js";
import { createTestApp, injectJson } from "./helpers/http.js";
import { isDatabaseAvailable, resetDatabase, setupTestDb } from "./helpers/test-db.js";

let dbAvailable = false;

describe("backward compatibility", () => {
  let app: Awaited<ReturnType<typeof createTestApp>>;

  before(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) return;
    await setupTestDb();
    app = await createTestApp();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await resetDatabase();
  });

  after(async () => {
    if (!dbAvailable) return;
    await app.close();
    await closeDb();
  });

  it("existing unowned demo app still works via API key", { skip: () => !dbAvailable }, async () => {
    const rawKey = generateApiKey();
    const [demoApp] = await db.insert(apps).values({ name: "Demo App" }).returning();
    await db.insert(apiKeys).values({
      appId: demoApp.id,
      keyHash: hashApiKey(rawKey),
      label: "Demo key",
    });

    const endpoint = await injectJson(app, {
      method: "POST",
      url: "/v1/endpoints",
      headers: { authorization: `Bearer ${rawKey}` },
      payload: {
        url: "http://localhost:4000/webhook",
        event_types: ["payment_success"],
      },
    });
    assert.equal(endpoint.statusCode, 201);

    const ingest = await injectJson(app, {
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${rawKey}` },
      payload: {
        event_type: "payment_success",
        payload: { invoice_id: "inv_demo" },
      },
    });
    assert.equal(ingest.statusCode, 202);
  });

  it("unowned demo app does not appear in dashboard", { skip: () => !dbAvailable }, async () => {
    const rawKey = generateApiKey();
    const [demoApp] = await db.insert(apps).values({ name: "Demo App" }).returning();
    await db.insert(apiKeys).values({
      appId: demoApp.id,
      keyHash: hashApiKey(rawKey),
      label: "Demo key",
    });

    const signup = await injectJson(app, {
      method: "POST",
      url: "/auth/signup",
      payload: { name: "User", email: "user@example.com", password: "password123" },
    });
    const cookieHeader = signup.headers["set-cookie"];
    const cookie = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    assert.ok(cookie);

    const appsResponse = await injectJson(app, {
      method: "GET",
      url: "/dashboard/apps",
      cookie: cookie!.split(";")[0],
    });
    const body = appsResponse.json() as { apps: Array<{ id: string }> };
    assert.equal(body.apps.some((item) => item.id === demoApp.id), false);
  });
});
