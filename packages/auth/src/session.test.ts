import { describe, expect, it } from "vitest";
import {
  getCookie,
  SESSION_COOKIE_NAME,
  sessionCookie,
} from "./session";

describe("session utilities", () => {
  it("reads the session cookie without exposing unrelated cookies", () => {
    const request = new Request("https://seller.azadimart.com", {
      headers: {
        cookie: `theme=dark; ${SESSION_COOKIE_NAME}=abc123; other=value`,
      },
    });

    expect(getCookie(request, SESSION_COOKIE_NAME)).toBe("abc123");
    expect(getCookie(request, "missing")).toBeNull();
  });

  it("sets secure HTTP-only session cookie attributes in production", () => {
    const previous = process.env.NODE_ENV;
    Object.assign(process.env, { NODE_ENV: "production" });

    const header = sessionCookie("token value", 900);

    expect(header).toContain(`${SESSION_COOKIE_NAME}=token%20value`);
    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=900");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Secure");

    if (previous === undefined) delete process.env.NODE_ENV;
    else Object.assign(process.env, { NODE_ENV: previous });
  });
});
