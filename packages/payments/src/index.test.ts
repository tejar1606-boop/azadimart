import { describe, expect, it } from "vitest";
import { CodPaymentProvider, getPaymentProvider, getPaymentProviderReadiness } from "./index";

describe("payment providers", () => {
  it("creates a COD intent without a PSP", async () => {
    const intent = await new CodPaymentProvider().createPayment({
      orderId: "ord_1",
      amountPaise: 49900,
      currency: "INR",
      customer: { id: "c1" },
      returnUrl: "http://localhost:3000/checkout/complete",
    });
    expect(intent.provider).toBe("COD");
    expect(intent.status).toBe("PENDING");
  });

  it("exposes Razorpay and Cashfree as unconfigured adapters", async () => {
    await expect(getPaymentProvider("RAZORPAY").createPayment({
      orderId: "ord_1",
      amountPaise: 100,
      currency: "INR",
      customer: { id: "c1" },
      returnUrl: "http://localhost:3000",
    })).rejects.toThrow("RAZORPAY is not configured");
  });
});

it("reports payment readiness without exposing credentials", () => {
  expect(getPaymentProviderReadiness()).toEqual([
    { code: "COD", isConfigured: true },
    { code: "RAZORPAY", isConfigured: false },
    { code: "CASHFREE", isConfigured: false },
  ]);
});
