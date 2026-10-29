import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secrets";

describe("bank data encryption", () => {
  beforeEach(() => { process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64"); });
  it("round-trips and never stores the plain value", () => {
    const stored = encryptSecret("50100123456789");
    expect(stored).not.toContain("50100123456789");
    expect(decryptSecret(stored)).toBe("50100123456789");
  });
  it("uses a fresh IV each time", () => {
    expect(encryptSecret("123")).not.toBe(encryptSecret("123"));
  });
  it("detects tampering", () => {
    const [v, iv, tag, data] = encryptSecret("50100123456789").split(":");
    const flipped = Buffer.from(data!, "base64"); flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });
  it("refuses a missing or short key", () => {
    process.env.DATA_ENCRYPTION_KEY = "c2hvcnQ=";
    expect(() => encryptSecret("x")).toThrow(/DATA_ENCRYPTION_KEY/);
  });
});
