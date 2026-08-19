import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const API_KEY_PREFIX = "whsec";
const JWT_ALG = "HS256";
const PASSWORD_SALT_BYTES = 16;

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}_${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHash] = storedHash.split(":");
  if (!salt || !expectedHash) return false;
  const actualHash = scryptSync(password, salt, 64).toString("hex");
  return safeEqual(actualHash, expectedHash);
}

type JwtClaims = {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
};

export type AuthenticatedUserToken = Pick<JwtClaims, "sub" | "email" | "name">;

export function signUserJwt(user: AuthenticatedUserToken): string {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const payload: JwtClaims = {
    sub: user.sub,
    email: user.email,
    name: user.name,
    iat: nowInSeconds,
    exp: nowInSeconds + config.JWT_EXPIRES_IN_SECONDS,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: JWT_ALG, typ: "JWT" }));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signJwtSegment(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyUserJwt(token: string): AuthenticatedUserToken | null {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) return null;

  const expectedSignature = signJwtSegment(`${encodedHeader}.${encodedPayload}`);
  if (!safeEqual(signature, expectedSignature)) return null;

  const header = parseBase64Json(encodedHeader) as { alg?: string; typ?: string } | null;
  if (!header || header.alg !== JWT_ALG || header.typ !== "JWT") return null;

  const payload = parseBase64Json(encodedPayload) as JwtClaims | null;
  if (!payload) return null;
  if (!payload.sub || !payload.email || !payload.name || !payload.exp) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
  };
}

function signJwtSegment(value: string): string {
  return createHmac("sha256", config.JWT_SECRET).update(value).digest("base64url");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function parseBase64Json(value: string): unknown | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}
