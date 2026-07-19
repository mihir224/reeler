import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  clearSessionCookie,
  requireSession,
  setSessionCookie,
} from "./auth.js";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../domain/auth.js";
import { createSession, revokeSession } from "../domain/session.js";
import { loginSchema, signupSchema } from "../domain/validation.js";
import {
  loginRouteSchema,
  logoutRouteSchema,
  meRouteSchema,
  signupRouteSchema,
} from "./schemas.js";

function formatUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/signup", { schema: signupRouteSchema }, async (request, reply) => {
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email.toLowerCase()))
      .limit(1);

    if (existing) {
      return reply.code(409).send({ error: "Email already registered" });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const [user] = await db
      .insert(users)
      .values({
        email: parsed.data.email.toLowerCase(),
        passwordHash,
        name: parsed.data.name,
      })
      .returning();

    const token = await createSession(user.id);
    setSessionCookie(reply, token);

    return reply.code(201).send({ user: formatUser(user) });
  });

  app.post("/auth/login", { schema: loginRouteSchema }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid request body", details: parsed.error.flatten() });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email.toLowerCase()))
      .limit(1);

    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const token = await createSession(user.id);
    setSessionCookie(reply, token);

    return reply.send({ user: formatUser(user) });
  });

  app.post("/auth/logout", { schema: logoutRouteSchema }, async (request, reply) => {
    const token = request.cookies[config.SESSION_COOKIE_NAME];
    if (token) {
      await revokeSession(token);
    }
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get("/auth/me", { schema: meRouteSchema }, async (request, reply) => {
    await requireSession(request, reply);
    if (reply.sent) return;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, request.session.userId))
      .limit(1);

    if (!user) {
      clearSessionCookie(reply);
      return reply.code(401).send({ error: "User not found" });
    }

    return reply.send({ user: formatUser(user) });
  });
}
