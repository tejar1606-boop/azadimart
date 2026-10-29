import { describe, expect, it, vi } from "vitest";
import { AppError } from "@azadimart/shared";
import { requireApiAccess } from "./api";
import { getSessionPrincipal } from "./session";

vi.mock("./session", () => ({
  getSessionPrincipal: vi.fn(),
}));

const getPrincipal = vi.mocked(getSessionPrincipal);

describe("API access guard", () => {
  it("requires a valid session", async () => {
    getPrincipal.mockResolvedValue(null);

    await expect(requireApiAccess(new Request("https://seller.example"), "seller", ["SELLER"]))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a customer from seller APIs", async () => {
    getPrincipal.mockResolvedValue({
      userId: "u1",
      role: "CUSTOMER",
      customerId: "c1",
    });

    await expect(requireApiAccess(new Request("https://seller.example"), "seller", ["SELLER"]))
      .rejects.toBeInstanceOf(AppError);
  });

  it("accepts an active seller principal for the seller audience", async () => {
    const principal = {
      userId: "u2",
      role: "SELLER" as const,
      sellerId: "s1",
    };
    getPrincipal.mockResolvedValue(principal);

    await expect(requireApiAccess(new Request("https://seller.example"), "seller", ["SELLER"]))
      .resolves.toEqual(principal);
  });
});
