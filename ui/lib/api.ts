const PLATFORM_URL = process.env.PLATFORM_URL ?? process.env.NEXT_PUBLIC_PLATFORM_URL ?? "http://localhost:3000";

export function getPlatformUrl() {
  return PLATFORM_URL;
}

export async function parseResponse(response: Response) {
  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { raw: text };
    }
  }
  if (!response.ok) {
    throw new Error(
      (parsed.error as string | undefined) ??
        (parsed.detail as string | undefined) ??
        `Request failed with ${response.status}`,
    );
  }
  return parsed;
}

export async function authFetch(path: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`/api/auth${path}`, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "include",
    cache: "no-store",
  });
  return parseResponse(response);
}

export async function dashboardFetch(path: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`/api/dashboard${path}`, {
    method: options.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "include",
    cache: "no-store",
  });
  return parseResponse(response);
}

export function normalizeApiKey(value: string) {
  return value.trim().replace(/^Bearer\s+/i, "").trim();
}

export async function platformFetch(
  path: string,
  apiKey: string,
  options: { method?: string; body?: unknown; platformUrl?: string } = {},
) {
  const normalizedApiKey = normalizeApiKey(apiKey);
  if (!normalizedApiKey) throw new Error("Add the platform API key first.");
  const response = await fetch(`/api/platform${path}`, {
    method: options.method ?? "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${normalizedApiKey}`,
      "x-platform-url": options.platformUrl ?? getPlatformUrl(),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  return parseResponse(response);
}

export type User = {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type App = {
  id: string;
  name: string;
  created_at: string;
};

export type CatalogEvent = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type Endpoint = {
  id: string;
  url: string;
  event_types: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiKeyMeta = {
  id: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
};

export type Delivery = {
  id: string;
  event_id: string;
  event_type: string;
  endpoint_url: string;
  status: string;
  attempt_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  last_response_code: number | null;
  created_at: string;
};
