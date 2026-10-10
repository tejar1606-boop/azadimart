import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCaptcha } from "./captcha";
import { getClientIp, LOGIN_POLICY, secondsUntilUnlocked } from "./login-guard";

const now = new Date("2026-10-08T10:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe("secondsUntilUnlocked", () => {
  it("allows login below the failure limit", () => {
    expect(secondsUntilUnlocked([minutesAgo(1), minutesAgo(2)], 5, 15, now)).toBe(0);
  });

  it("locks until the oldest counted failure leaves the window", () => {
    const failures = [1, 2, 3, 4, 5].map(minutesAgo); // newest first
    expect(secondsUntilUnlocked(failures, 5, 15, now)).toBe(10 * 60);
  });

  it("unlocks once the window has passed", () => {
    const failures = [16, 17, 18, 19, 20].map(minutesAgo);
    expect(secondsUntilUnlocked(failures, 5, 15, now)).toBe(0);
  });

  it("is stricter for admin than the IP-wide limit", () => {
    expect(LOGIN_POLICY.account.admin.windowMinutes).toBeGreaterThan(LOGIN_POLICY.account.storefront.windowMinutes);
    expect(LOGIN_POLICY.ip.maxFailures).toBeGreaterThan(LOGIN_POLICY.account.admin.maxFailures);
  });
});

describe("getClientIp", () => {
  it("uses the first x-forwarded-for hop", () => {
    const request = new Request("https://azadimart.com", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
    expect(getClientIp(request)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then unknown", () => {
    expect(getClientIp(new Request("https://azadimart.com", { headers: { "x-real-ip": "198.51.100.2" } }))).toBe("198.51.100.2");
    expect(getClientIp(new Request("https://azadimart.com"))).toBe("unknown");
  });
});

describe("verifyCaptcha", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is skipped when no secret is configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const fetchImpl = vi.fn();
    await expect(verifyCaptcha(undefined, "1.2.3.4", fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires a token when enabled", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    await expect(verifyCaptcha(undefined, "1.2.3.4", vi.fn())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("accepts a token Cloudflare verifies and sends the client IP", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true })));
    await verifyCaptcha("token", "1.2.3.4", fetchImpl);
    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("response")).toBe("token");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("rejects a token Cloudflare does not verify", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] })));
    await expect(verifyCaptcha("bad", "1.2.3.4", fetchImpl)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("fails closed when Cloudflare is unreachable", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(verifyCaptcha("token", "1.2.3.4", fetchImpl)).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
