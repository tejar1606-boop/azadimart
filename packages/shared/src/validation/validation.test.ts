import { describe, expect, it } from "vitest";
import { productDraftSchema, sellerRegistrationSchema } from "./index";

describe("validation", () => {
  it("accepts a valid Indian mobile number", () => {
    const result = sellerRegistrationSchema.safeParse({
      storeName: "Sunrise Traders",
      legalName: "Sunrise Traders Pvt Ltd",
      email: "seller@example.com",
      phone: "9876543210",
      password: "TestPassword123!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 8 product images", () => {
    const ids = Array.from({ length: 9 }, () => "11111111-1111-4111-8111-111111111111");
    const result = productDraftSchema.safeParse({
      title: "Cotton kurta",
      categoryId: "11111111-1111-4111-8111-111111111111",
      imageAssetIds: ids,
    });
    expect(result.success).toBe(false);
  });
});
