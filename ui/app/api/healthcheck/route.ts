import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("target");
  if (!target) {
    return NextResponse.json({ ok: false, error: "Missing target" }, { status: 400 });
  }

  const response = await fetch(new URL("health", ensureTrailingSlash(target)), {
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
