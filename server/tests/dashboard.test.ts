import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { closeDb } from "../src/db/client.js";
import { createTestApp, injectJson, sessionCookieFromResponse } from "./helpers/http.js";
import { isDatabaseAvailable, resetDatabase, setupTestDb } from "./helpers/test-db.js";

let dbAvailable = false;

async function signupAndGetCookie(app: Awaited<ReturnType<typeof createTestApp>>, email: string) {
  const response = await injectJson(app, {
    method: "POST",
    url: "/auth/signup",
    payload: { name: email.split("@")[0], email, password: "password123" },
  });
  const cookie = sessionCookieFromResponse(response.headers);
  assert.ok(cookie);
  return cookie!;
}

describe("dashboard routes", () => {
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

  it("app creation works", { skip: () => !dbAvailable }, async () => {
    const cookie = await signupAndGetCookie(app, "owner@example.com");
    const response = await injectJson(app, {
      method: "POST",
      url: "/dashboard/apps",
      cookie,
      payload: { name: "Payments" },
    });
    assert.equal(response.statusCode, 201);
    const body = response.json() as { id: string; name: string };
    assert.equal(body.name, "Payments");
  });

  it("user can only access their own apps", { skip: () => !dbAvailable }, async () => {
    const cookieA = await signupAndGetCookie(app, "a@example.com");
    const cookieB = await signupAndGetCookie(app, "b@example.com");

    const created = await injectJson(app, {
      method: "POST",
      url: "/dashboard/apps",
      cookie: cookieA,
      payload: { name: "A App" },
    });
    const appId = (created.json() as { id: string }).id;

    const denied = await injectJson(app, {
      method: "GET",
      url: `/dashboard/apps/${appId}/events`,
      cookie: cookieB,
    });
    assert.equal(denied.statusCode, 404);
  });

  it("event catalog creation works", { skip: () => !dbAvailable }, async () => {
    const cookie = await signupAndGetCookie(app, "catalog@example.com");
    const appResponse = await injectJson(app, {
      method: "POST",
      url: "/dashboard/apps",
      cookie,
      payload: { name: "Catalog App" },
    });
    const appId = (appResponse.json() as { id: string }).id;

    const response = await injectJson(app, {
      method: "POST",
      url: `/dashboard/apps/${appId}/events`,
      cookie,
      payload: { name: "payment_success", description: "Paid" },
    });
    assert.equal(response.statusCode, 201);
  });

  it("endpoint creation returns signing secret once", { skip: () => !dbAvailable }, async () => {
    const cookie = await signupAndGetCookie(app, "endpoint@example.com");
    const appResponse = await injectJson(app, {
      method: "POST",
      url: "/dashboard/apps",
      cookie,
      payload: { name: "Endpoint App" },
    });
    const appId = (appResponse.json() as { id: string }).id;

    await injectJson(app, {
      method: "POST",
      url: `/dashboard/apps/${appId}/events`,
      cookie,
      payload: { name: "payment_success", description: "" },
    });

    const created = await injectJson(app, {
      method: "POST",
      url: `/dashboard/apps/${appId}/endpoints`,
      cookie,
      payload: {
        url: "http://localhost:4000/webhook",
        event_types: ["payment_success"],
      },
    });
    assert.equal(created.statusCode, 201);
    const body = created.json() as { verification?: { signing_secret?: string } };
    assert.ok(body.verification?.signing_secret?.startsWith("whsig_"));

    const listed = await injectJson(app, {
      method: "GET",
      url: `/dashboard/apps/${appId}/endpoints`,
      cookie,
    });
    const listedBody = listed.json() as { endpoints: Array<Record<string, unknown>> };
    assert.equal(listedBody.endpoints[0].secret, undefined);
  });

  it("API key creation returns raw key once", { skip: () => !dbAvailable }, async () => {
    const cookie = await signupAndGetCookie(app, "apikey@example.com");
    const appResponse = await injectJson(app, {
      method: "POST",
      url: "/dashboard/apps",
      cookie,
      payload: { name: "Key App" },
    });
    const appId = (appResponse.json() as { id: string }).id;

    const created = await injectJson(app, {
      method: "POST",
      url: `/dashboard/apps/${appId}/api-keys`,
      cookie,
      payload: { label: "Prod" },
    });
    assert.equal(created.statusCode, 201);
    const body = created.json() as { api_key: string };
    assert.ok(body.api_key.startsWith("whsec_"));

    const listed = await injectJson(app, {
      method: "GET",
      url: `/dashboard/apps/${appId}/api-keys`,
      cookie,
    });
    const listedBody = listed.json() as { api_keys: Array<Record<string, unknown>> };
    assert.equal(listedBody.api_keys[0].api_key, undefined);
  });

  it("revoked API key cannot ingest events", { skip: () => !dbAvailable }, async () => {
    const cookie = await signupAndGetCookie(app, "revoke@example.com");
    const appResponse = await injectJson(app, {
      method: "POST",
      url: "/dashboard/apps",
      cookie,
      payload: { name: "Revoke App" },
    });
    const appId = (appResponse.json() as { id: string }).id;

    const keyResponse = await injectJson(app, {
      method: "POST",
      url: `/dashboard/apps/${appId}/api-keys`,
      cookie,
      payload: { label: "Temp" },
    });
    const { api_key: apiKey, id: keyId } = keyResponse.json() as { api_key: string; id: string };

    await injectJson(app, {
      method: "POST",
      url: `/dashboard/apps/${appId}/api-keys/${keyId}/revoke`,
      cookie,
    });

    const ingest = await injectJson(app, {
      method: "POST",
      url: "/v1/events",
      headers: { authorization: `Bearer ${apiKey}` },
      payload: { event_type: "payment_success", payload: { ok: true } },
    });
    assert.equal(ingest.statusCode, 401);
  });
});
