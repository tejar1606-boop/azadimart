import { describe, expect, it } from "vitest";
import { FREE_DELIVERY_FROM_PAISE, customerPaysDelivery, deliveryChargeFor, loimartShippingFee, shippingZone, splitReturnShipping } from "./shipping-rates";

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

describe("who pays delivery", () => {
  it("shopper pays below ₹301; free from ₹301", () => {
    expect(FREE_DELIVERY_FROM_PAISE).toBe(30_100);
    expect(customerPaysDelivery(30_099)).toBe(true);
    expect(customerPaysDelivery(30_100)).toBe(false);
    expect(customerPaysDelivery(50_000)).toBe(false);
    expect(customerPaysDelivery(0)).toBe(false);
  });
  it("adds one parcel per seller", () => {
    const hyd = { city: "Hyderabad", state: "Telangana" };
    expect(deliveryChargeFor([{ weightGrams: 300, from: hyd }, { weightGrams: 300, from: { city: "Pune", state: "Maharashtra" } }], hyd, true)).toBe(3500 + 2500 + 6000 + 2500);
  });
  it("splits a return pickup 40% LOIMART, 60% seller", () => {
    expect(splitReturnShipping(6000)).toEqual({ loimartPaise: 2400, sellerPaise: 3600 });
    expect(splitReturnShipping(3501)).toEqual({ loimartPaise: 1400, sellerPaise: 2101 });
  });
});
