// Edge-safe security helpers shared by the three apps' middleware (no Node imports).

export type CspOptions = {
  nonce: string;
  /** Development needs eval for React Refresh and a websocket for hot reload. */
  dev: boolean;
  /** Object-storage endpoint (STORAGE_ENDPOINT) that browsers upload to directly. */
  storageEndpoint?: string;
};

const TURNSTILE = "https://challenges.cloudflare.com";

/**
 * Content-Security-Policy with a per-request nonce: only scripts that our
 * pages render (or load themselves, via 'strict-dynamic') can run, so an
 * injected <script> or a script from another site is blocked. Images and
 * videos may come from any https host (they can't run code); uploads go to
 * this site or the object store; the page can't be framed elsewhere.
 */
export function buildContentSecurityPolicy({ nonce, dev, storageEndpoint }: CspOptions): string {
  let storageOrigin = "";
  try { if (storageEndpoint) storageOrigin = new URL(storageEndpoint).origin; } catch { /* ignore a malformed endpoint */ }
  const connect = ["'self'", TURNSTILE, "https://*.r2.cloudflarestorage.com", "https://*.amazonaws.com", storageOrigin, dev ? "ws:" : ""].filter(Boolean);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", TURNSTILE, ...(dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connect,
    "frame-src": [TURNSTILE],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!dev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** A random nonce for one response (base64 of 16 random bytes). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * True when a browser is sending a state-changing request from another site
 * (cross-site request forgery). Browsers always send Origin on such requests
 * and Sec-Fetch-Site on modern ones. Server-to-server calls (payment or
 * courier webhooks, scripts) send neither and are allowed; they must
 * authenticate themselves, e.g. with a signature.
 */
export function isCrossSiteWrite(request: { method: string; headers: Headers }, host: string): boolean {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return false;
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    try { return new URL(origin).host.toLowerCase() !== host.toLowerCase(); } catch { return true; }
  }
  if (origin === "null") return true;
  return request.headers.get("sec-fetch-site") === "cross-site";
}
