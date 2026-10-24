import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateOtp, hashOtp, otpMatches, smsProvider } from "./otp";

describe("OTP helpers", () => {
  beforeEach(() => { vi.stubEnv("AUTH_SECRET", "test-secret-for-otp"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("generates 6-digit codes", () => {
    for (let i = 0; i < 200; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it("accepts the right code and rejects a wrong one", () => {
    const stored = hashOtp("123456", "9876543210");
    expect(otpMatches("123456", "9876543210", stored)).toBe(true);
    expect(otpMatches("123457", "9876543210", stored)).toBe(false);
  });

  it("binds the code to the phone number", () => {
    const stored = hashOtp("123456", "9876543210");
    expect(otpMatches("123456", "9123456789", stored)).toBe(false);
  });

  it("never stores the plain code", () => {
    expect(hashOtp("123456", "9876543210")).not.toContain("123456");
  });

  it("uses console SMS only outside production", () => {
    vi.stubEnv("SMS_PROVIDER", "console");
    vi.stubEnv("NODE_ENV", "development");
    expect(smsProvider()).toBe("console");
    vi.stubEnv("NODE_ENV", "production");
    expect(smsProvider()).toBe("none");
  });

  it("uses MSG91 only when its keys are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SMS_PROVIDER", "msg91");
    expect(smsProvider()).toBe("none");
    vi.stubEnv("MSG91_AUTH_KEY", "k");
    vi.stubEnv("MSG91_OTP_TEMPLATE_ID", "t");
    expect(smsProvider()).toBe("msg91");
  });
});
