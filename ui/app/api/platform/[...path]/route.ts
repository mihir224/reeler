import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyPlatform(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyPlatform(request, context);
}

async function proxyPlatform(request: NextRequest, context: RouteContext) {
  const params = await Promise.resolve(context.params);
  const baseUrl = request.headers.get("x-platform-url") ?? "http://localhost:3000";
  const targetUrl = new URL(params.path.join("/"), ensureTrailingSlash(baseUrl));
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers();
  const authorization = request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  headers.set("content-type", request.headers.get("content-type") ?? "application/json");

  const body = request.method === "GET" ? undefined : await request.text();
  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
