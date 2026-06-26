import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE_NAME,
  ACCESS_SESSION_TTL_SECONDS,
  createAccessToken,
  getAccessConfig,
  getRoleForAccessCode,
} from "@/lib/access-control";

function safeNextPath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  if (value.startsWith("/api/") || value.startsWith("/login")) {
    return "/dashboard";
  }

  return value;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const suppliedCode = String(form.get("access_code") ?? "");
  const nextPath = safeNextPath(form.get("next"));
  const config = getAccessConfig();

  if (!config.authRequired) {
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  if (!config.ready) {
    return NextResponse.redirect(new URL("/login?setup=required", request.url));
  }

  const role = getRoleForAccessCode(suppliedCode, config);

  if (!role) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "invalid");
    url.searchParams.set("next", nextPath);
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const token = await createAccessToken(config.sessionSecret, Date.now(), role);

  response.cookies.set({
    httpOnly: true,
    maxAge: ACCESS_SESSION_TTL_SECONDS,
    name: ACCESS_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    value: token,
  });

  return response;
}
