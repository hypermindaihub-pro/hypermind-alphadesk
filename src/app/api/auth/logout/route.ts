import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE_NAME } from "@/lib/access-control";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?logged_out=1", request.url));

  response.cookies.set({
    httpOnly: true,
    maxAge: 0,
    name: ACCESS_COOKIE_NAME,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    value: "",
  });

  return response;
}
