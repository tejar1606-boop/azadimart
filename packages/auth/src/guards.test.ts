import { describe, expect, it } from "vitest";
import { AppError } from "@azadimart/shared";
import { requireAudience, requireSellerScope, requireSession, type SessionPrincipal } from "./guards";

const seller: SessionPrincipal = {
  userId: "u1",
  role: "SELLER",
  sellerId: "s1",
};

const customer: SessionPrincipal = {
  userId: "u2",
  role: "CUSTOMER",
  customerId: "c1",
};

describe("auth guards", () => {
  it("rejects anonymous access", () => {
    expect(() => requireSession(null)).toThrow(AppError);
  });

  it("blocks customers from seller and admin apps", () => {
    expect(() => requireAudience(customer, "seller")).toThrow(AppError);
    expect(() => requireAudience(customer, "admin")).toThrow(AppError);
    expect(requireAudience(customer, "storefront").role).toBe("CUSTOMER");
  });

  it("blocks a seller from another seller's resources", () => {
    expect(() => requireSellerScope(seller, "s-other")).toThrow(AppError);
    expect(() => requireSellerScope(seller, "s1")).not.toThrow();
  });
});
