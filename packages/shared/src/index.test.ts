import { describe, expect, it } from "vitest";
import { AppError, toApiError } from "./errors";
import { canAccessAudience, isPrivileged, isRole } from "./roles";
import { createLogger } from "./logger";

describe("roles", () => {
  it("keeps customers on the storefront audience only", () => {
    expect(canAccessAudience("CUSTOMER", "storefront")).toBe(true);
    expect(canAccessAudience("CUSTOMER", "seller")).toBe(false);
    expect(canAccessAudience("CUSTOMER", "admin")).toBe(false);
  });

  it("keeps sellers off admin and storefront APIs", () => {
    expect(canAccessAudience("SELLER", "seller")).toBe(true);
    expect(canAccessAudience("SELLER", "admin")).toBe(false);
    expect(canAccessAudience("SELLER", "storefront")).toBe(false);
  });

  it("treats only admin roles as privileged", () => {
    expect(isPrivileged("ADMIN")).toBe(true);
    expect(isPrivileged("SUPER_ADMIN")).toBe(true);
    expect(isPrivileged("SELLER")).toBe(false);
    expect(isRole("CUSTOMER")).toBe(true);
    expect(isRole("hacker")).toBe(false);
  });
});

describe("errors", () => {
  it("maps AppError to a stable API body", () => {
    const result = toApiError(new AppError("FORBIDDEN", "No access"), "req-1");
    expect(result.status).toBe(403);
    expect(result.body.error.requestId).toBe("req-1");
    expect(result.body.error.code).toBe("FORBIDDEN");
  });

  it("hides unexpected error details", () => {
    const result = toApiError(new Error("db password=super-secret"), "req-2");
    expect(result.status).toBe(500);
    expect(result.body.error.message).toBe("An unexpected error occurred");
    expect(JSON.stringify(result.body)).not.toContain("super-secret");
  });
});

describe("logger", () => {
  it("redacts secrets from structured fields", () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: string) => {
      lines.push(line);
    };
    const log = createLogger();
    log.info("test", { password: "nopenopenope", nested: { token: "abc" } });
    console.log = original;
    expect(lines[0]).toContain("[REDACTED]");
    expect(lines[0]).not.toContain("nopenopenope");
  });
});
