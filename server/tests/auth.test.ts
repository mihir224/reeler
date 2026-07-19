import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { closeDb } from "../src/db/client.js";
import { createTestApp, injectJson, sessionCookieFromResponse } from "./helpers/http.js";
import { isDatabaseAvailable, resetDatabase, setupTestDb } from "./helpers/test-db.js";

let dbAvailable = false;

describe("auth routes", () => {
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

  it("signup creates user", { skip: () => !dbAvailable }, async () => {
    const response = await injectJson(app, {
      method: "POST",
      url: "/auth/signup",
      payload: {
        name: "Mihir",
        email: "mihir@example.com",
        password: "password123",
      },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json() as { user: { email: string; name: string } };
    assert.equal(body.user.email, "mihir@example.com");
    assert.equal(body.user.name, "Mihir");
    assert.ok(sessionCookieFromResponse(response.headers));
  });

  it("duplicate email rejected", { skip: () => !dbAvailable }, async () => {
    await injectJson(app, {
      method: "POST",
      url: "/auth/signup",
      payload: { name: "One", email: "dup@example.com", password: "password123" },
    });

    const response = await injectJson(app, {
      method: "POST",
      url: "/auth/signup",
      payload: { name: "Two", email: "dup@example.com", password: "password123" },
    });

    assert.equal(response.statusCode, 409);
  });

  it("login creates session", { skip: () => !dbAvailable }, async () => {
    await injectJson(app, {
      method: "POST",
      url: "/auth/signup",
      payload: { name: "Mihir", email: "login@example.com", password: "password123" },
    });

    const response = await injectJson(app, {
      method: "POST",
      url: "/auth/login",
      payload: { email: "login@example.com", password: "password123" },
    });

    assert.equal(response.statusCode, 200);
    assert.ok(sessionCookieFromResponse(response.headers));
  });

  it("logout clears session", { skip: () => !dbAvailable }, async () => {
    const signup = await injectJson(app, {
      method: "POST",
      url: "/auth/signup",
      payload: { name: "Mihir", email: "logout@example.com", password: "password123" },
    });
    const cookie = sessionCookieFromResponse(signup.headers);
    assert.ok(cookie);

    const logout = await injectJson(app, {
      method: "POST",
      url: "/auth/logout",
      cookie: cookie!,
    });
    assert.equal(logout.statusCode, 200);

    const me = await injectJson(app, { method: "GET", url: "/auth/me", cookie: cookie! });
    assert.equal(me.statusCode, 401);
  });

  it("protected dashboard APIs reject unauthenticated requests", { skip: () => !dbAvailable }, async () => {
    const response = await injectJson(app, { method: "GET", url: "/dashboard/apps" });
    assert.equal(response.statusCode, 401);
  });
});
