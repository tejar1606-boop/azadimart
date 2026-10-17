import { getCookie, revokeSession, sessionCookie, SESSION_COOKIE_NAME } from "@azadimart/auth";
import { createDatabase } from "@azadimart/database";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const token = getCookie(request, SESSION_COOKIE_NAME);
  if (token) {
    await revokeSession(createDatabase(), token);
  }

  const response = NextResponse.json({ ok: true, audience: "seller" });
  response.headers.append("Set-Cookie", sessionCookie("", 0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
