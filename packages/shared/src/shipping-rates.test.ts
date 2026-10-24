import { describe, expect, it } from "vitest";
import { loimartShippingFee, shippingZone } from "./shipping-rates";

describe("LOIMART shipping fee", () => {
  it("works out the zone", () => {
    expect(shippingZone({ city: "Hyderabad", state: "Telangana" }, { city: "hyderabad ", state: "TELANGANA" })).toBe("local");
    expect(shippingZone({ city: "Hyderabad", state: "Telangana" }, { city: "Warangal", state: "Telangana" })).toBe("regional");
    expect(shippingZone({ city: "Hyderabad", state: "Telangana" }, { city: "Pune", state: "Maharashtra" })).toBe("national");
  });
  it("charges per 500 g slab plus COD", () => {
    expect(loimartShippingFee({ weightGrams: 300, zone: "local", cod: false })).toBe(3500);
    expect(loimartShippingFee({ weightGrams: 501, zone: "national", cod: false })).toBe(10500);
    expect(loimartShippingFee({ weightGrams: 1500, zone: "regional", cod: true })).toBe(4500 + 2 * 3500 + 2500);
  });
});
