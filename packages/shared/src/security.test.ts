import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce, isCrossSiteWrite } from "./security";

const req = (method: string, headers: Record<string, string> = {}) => ({ method, headers: new Headers(headers) });

describe("isCrossSiteWrite", () => {
  it("allows reads from anywhere", () => {
    expect(isCrossSiteWrite(req("GET", { origin: "https://evil.example" }), "azadimart.com")).toBe(false);
  });
  it("allows same-origin writes", () => {
    expect(isCrossSiteWrite(req("POST", { origin: "https://azadimart.com" }), "azadimart.com")).toBe(false);
    expect(isCrossSiteWrite(req("POST", { origin: "http://localhost:3000" }), "localhost:3000")).toBe(false);
  });
  it("blocks writes from another site", () => {
    expect(isCrossSiteWrite(req("POST", { origin: "https://evil.example" }), "azadimart.com")).toBe(true);
    expect(isCrossSiteWrite(req("DELETE", { origin: "https://seller.azadimart.com" }), "admin.azadimart.com")).toBe(true);
    expect(isCrossSiteWrite(req("POST", { origin: "null" }), "azadimart.com")).toBe(true);
    expect(isCrossSiteWrite(req("PATCH", { "sec-fetch-site": "cross-site" }), "azadimart.com")).toBe(true);
  });
  it("allows server-to-server calls without browser headers (webhooks)", () => {
    expect(isCrossSiteWrite(req("POST"), "azadimart.com")).toBe(false);
  });
});

describe("buildContentSecurityPolicy", () => {
  it("uses the nonce and blocks framing, plugins and eval in production", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc", dev: false, storageEndpoint: "https://acc.r2.cloudflarestorage.com/x" });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("https://acc.r2.cloudflarestorage.com");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("upgrade-insecure-requests");
  });
  it("allows eval and websockets only in development", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc", dev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
  });
  it("creates a fresh nonce each time", () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});
