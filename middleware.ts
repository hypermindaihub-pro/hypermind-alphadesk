import { NextRequest, NextResponse } from "next/server";
import {
  ACCESS_COOKIE_NAME,
  getAccessConfig,
  verifyAccessToken,
} from "./src/lib/access-control";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/favicon.ico",
];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/assets")
  );
}

export async function middleware(request: NextRequest) {
  const config = getAccessConfig();
  const { pathname } = request.nextUrl;

  if (!config.authRequired || isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!config.ready) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "AlphaDesk private access is not configured.",
          setupRequired: true,
        },
        { status: 503 },
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("setup", "required");
    return NextResponse.redirect(url);
  }

  const token = request.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const authenticated = await verifyAccessToken(token, config.sessionSecret);

  if (authenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      { status: 401 },
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"],
};
