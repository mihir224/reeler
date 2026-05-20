import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const baseUrl = request.headers.get("x-receiver-url") ?? "http://localhost:4000";
  const targetUrl = new URL("events", ensureTrailingSlash(baseUrl));

  const response = await fetch(targetUrl, {
    method: "GET",
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
