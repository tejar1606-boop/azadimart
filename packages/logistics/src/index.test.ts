import { describe, expect, it } from "vitest";
import { createShipmentForOrder, getLogisticsProvider, getLogisticsProviderReadiness } from "./index";

describe("logistics providers", () => {
  it("creates shipments through the abstraction, not a vendor SDK", async () => {
    const shipment = await createShipmentForOrder("MANUAL", {
      orderId: "o1",
      sellerId: "s1",
      pickup: {
        name: "Seller",
        phone: "9876543210",
        line1: "Warehouse",
        city: "Jaipur",
        state: "RJ",
        postalCode: "302001",
        country: "IN",
      },
      delivery: {
        name: "Customer",
        phone: "9123456789",
        line1: "Home",
        city: "Delhi",
        state: "DL",
        postalCode: "110001",
        country: "IN",
      },
      weightGrams: 500,
      declaredValuePaise: 99900,
    });
    expect(shipment.provider).toBe("MANUAL");
  });

  it("keeps Shiprocket, Delhivery, and Shadowfax as swap-in adapters", async () => {
    await expect(getLogisticsProvider("SHIPROCKET").quote({} as never)).rejects.toThrow(
      "SHIPROCKET is not configured",
    );
  });
});

it("reports logistics readiness without exposing credentials", () => {
  expect(getLogisticsProviderReadiness()).toEqual([
    { code: "MANUAL", isConfigured: true },
    { code: "SHIPROCKET", isConfigured: false },
    { code: "DELHIVERY", isConfigured: false },
    { code: "SHADOWFAX", isConfigured: false },
  ]);
});
