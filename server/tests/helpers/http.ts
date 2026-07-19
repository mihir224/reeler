import type { FastifyInstance, InjectOptions } from "fastify";
import { buildServer } from "../../src/api/server.js";
import { config } from "../../src/config.js";

export async function createTestApp(): Promise<FastifyInstance> {
  const app = await buildServer();
  await app.ready();
  return app;
}

export function sessionCookieFromResponse(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const setCookie = headers["set-cookie"];
  const values = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const value of values) {
    const match = value.match(new RegExp(`${config.SESSION_COOKIE_NAME}=([^;]+)`));
    if (match) return `${config.SESSION_COOKIE_NAME}=${match[1]}`;
  }
  return null;
}

export async function injectJson(
  app: FastifyInstance,
  options: InjectOptions & { cookie?: string },
) {
  const headers = { ...(options.headers ?? {}) } as Record<string, string>;
  if (options.cookie) headers.cookie = options.cookie;
  return app.inject({
    ...options,
    headers,
    payload: options.payload,
  });
}
