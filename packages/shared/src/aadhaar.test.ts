import { describe, expect, it } from "vitest";
import { aadhaarOtpRequestSchema, aadhaarOtpVerifySchema, isValidAadhaar, maskAadhaar } from "./validation";

describe("Aadhaar number check", () => {
  it("accepts numbers with a correct Verhoeff check digit", () => {
    expect(isValidAadhaar("234123412346")).toBe(true);
    expect(isValidAadhaar("499999999993")).toBe(true);
  });
  it("rejects a wrong check digit, wrong length, letters and 0/1 starts", () => {
    expect(isValidAadhaar("234123412347")).toBe(false);
    expect(isValidAadhaar("23412341234")).toBe(false);
    expect(isValidAadhaar("2341234123460")).toBe(false);
    expect(isValidAadhaar("23412341234a")).toBe(false);
    expect(isValidAadhaar("123412341234")).toBe(false);
    expect(isValidAadhaar("012345678901")).toBe(false);
  });
  it("masks all but the last 4 digits", () => {
    expect(maskAadhaar("2346")).toBe("XXXX XXXX 2346");
  });
  it("needs consent and accepts spaces or dashes", () => {
    expect(aadhaarOtpRequestSchema.parse({ aadhaarNumber: "2341 2341-2346", consent: true }).aadhaarNumber).toBe("234123412346");
    expect(aadhaarOtpRequestSchema.safeParse({ aadhaarNumber: "234123412346", consent: false }).success).toBe(false);
    expect(aadhaarOtpRequestSchema.safeParse({ aadhaarNumber: "234123412346" }).success).toBe(false);
  });
  it("OTP is exactly 6 digits", () => {
    expect(aadhaarOtpVerifySchema.safeParse({ otp: "123456" }).success).toBe(true);
    expect(aadhaarOtpVerifySchema.safeParse({ otp: "12345" }).success).toBe(false);
    expect(aadhaarOtpVerifySchema.safeParse({ otp: "12345a" }).success).toBe(false);
  });
});
