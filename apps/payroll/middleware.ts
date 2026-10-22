import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildContentSecurityPolicy, createNonce, isCrossSiteWrite } from "@azadimart/shared/security";

/**
 * Runs before every page and API call:
 * 1. Refuses state-changing requests sent by another website (CSRF).
 * 2. Adds a Content-Security-Policy with a fresh nonce, so only this app's own
 *    scripts can run. Next.js reads the nonce from the request header and
 *    stamps it on its scripts.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  if (isCrossSiteWrite(request, host)) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "This request was blocked because it came from another website." } }, { status: 403 });
  }

  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({ nonce, dev: process.env.NODE_ENV !== "production", storageEndpoint: process.env.STORAGE_ENDPOINT });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Everything except build assets and icons (which run no scripts).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png).*)"],
};
