import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
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

  it("maps zod validation failures to 400 with field details", () => {
    const parsed = z.object({ quantity: z.number().int().positive() }).safeParse({ quantity: 0 });
    const result = toApiError(parsed.error, "req-3");
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.body.error.details).toEqual([expect.objectContaining({ path: "quantity" })]);
  });

  it("maps malformed JSON bodies to 400", async () => {
    const error = await new Request("http://x", { method: "POST", body: "{bad" }).json().catch((e: unknown) => e);
    expect(toApiError(error, "req-4").status).toBe(400);
  });

  it("logs unexpected errors with the request id and scrubs credentials", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    toApiError(new Error("connect failed postgresql://neondb_owner:hunter2@host/db"), "req-5");
    const line = String(spy.mock.calls[0]?.[0]);
    spy.mockRestore();
    expect(line).toContain("req-5");
    expect(line).not.toContain("hunter2");
  });

  it("maps Postgres input errors to 4xx without leaking details", () => {
    const pg = (code: string) => Object.assign(new Error('duplicate key value violates unique constraint "products_sku_unique"'), { code });
    expect(toApiError(pg("23505"), "r").status).toBe(409);
    expect(toApiError(pg("23503"), "r").status).toBe(400);
    expect(toApiError(pg("22P02"), "r").status).toBe(400);
    expect(JSON.stringify(toApiError(pg("23505"), "r").body)).not.toContain("products_sku_unique");
    expect(toApiError(pg("40001"), "r").status).toBe(500);
  });

  it("does not log expected client errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    toApiError(new AppError("NOT_FOUND", "Missing"), "req-6");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
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
