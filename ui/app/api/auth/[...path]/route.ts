import { NextRequest, NextResponse } from "next/server";
import { getPlatformUrl } from "@/lib/api";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyWithCookies(request, context, "auth");
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyWithCookies(request, context, "auth");
}

async function proxyWithCookies(request: NextRequest, context: RouteContext, prefix: string) {
  const params = await Promise.resolve(context.params);
  const baseUrl = getPlatformUrl();
  const targetUrl = new URL(`${prefix}/${params.path.join("/")}`, ensureTrailingSlash(baseUrl));
  targetUrl.search = request.nextUrl.search;

  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  headers.set("content-type", request.headers.get("content-type") ?? "application/json");

  const body = request.method === "GET" ? undefined : await request.text();
  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });

  const text = await response.text();
  const nextResponse = new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });

  for (const setCookie of response.headers.getSetCookie()) {
    nextResponse.headers.append("set-cookie", setCookie);
  }

  return nextResponse;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
