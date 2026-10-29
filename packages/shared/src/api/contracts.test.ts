import { describe, expect, it } from "vitest";
import { API_CONTRACTS, apiContractMetaSchema, contractsForAudience } from "./index";

describe("API contracts", () => {
  it("every contract is well-formed", () => {
    for (const contract of API_CONTRACTS) {
      const parsed = apiContractMetaSchema.safeParse(contract);
      expect(parsed.success).toBe(true);
    }
  });

  it("never lets customers onto seller or admin contracts", () => {
    for (const contract of [...contractsForAudience("seller"), ...contractsForAudience("admin")]) {
      expect(contract.roles).not.toContain("CUSTOMER");
    }
  });

  it("never lets sellers onto protected admin contracts", () => {
    for (const contract of contractsForAudience("admin")) {
      expect(contract.roles).not.toContain("SELLER");
      if (contract.roles.length > 0) {
        expect(contract.auth).toBe("session");
      }
    }
  });

  it("scopes seller mutations to the seller audience", () => {
    const createProduct = API_CONTRACTS.find((c) => c.path === "/api/v1/products");
    expect(createProduct?.audience).toBe("seller");
    expect(createProduct?.roles).toEqual(["SELLER"]);
  });
});
