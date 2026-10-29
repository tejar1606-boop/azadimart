import { describe, expect, it } from "vitest";
import { DEFAULT_WALLET_SETTINGS, walletSettingsSchema, walletSplit, walletUsable } from "./customer-wallet";

describe("using wallet money on an order", () => {
  const s = DEFAULT_WALLET_SETTINGS;
  it("up to ₹50 per order on orders of ₹299 or more", () => {
    expect(walletUsable(10100, 50000, s)).toBe(5000);
    expect(walletUsable(10100, 29900, s)).toBe(5000);
    expect(walletUsable(10100, 29800, s)).toBe(0);
  });
  it("never more than the balance or the order", () => {
    expect(walletUsable(3000, 50000, s)).toBe(3000);
    expect(walletUsable(10100, 40000, { ...s, maxPerOrderPaise: 100000, minOrderPaise: 0 })).toBe(10100);
    expect(walletUsable(10100, 4000, { ...s, minOrderPaise: 0 })).toBe(4000);
  });
  it("nothing when switched off or empty", () => {
    expect(walletUsable(10100, 50000, { ...s, enabled: false })).toBe(0);
    expect(walletUsable(0, 50000, s)).toBe(0);
  });
  it("Admin settings are validated", () => {
    expect(walletSettingsSchema.safeParse(s).success).toBe(true);
    expect(walletSettingsSchema.safeParse({ ...s, expiryDays: 0 }).success).toBe(false);
  });
});

describe("walletSplit", () => {
  const s = DEFAULT_WALLET_SETTINGS;
  it("caps promotional money but lets full-use money cover the rest of the order", () => {
    expect(walletSplit({ promoPaise: 10100, fullPaise: 100000 }, 60000, s)).toEqual({ promoPaise: 5000, fullPaise: 55000, totalPaise: 60000 });
    expect(walletSplit({ promoPaise: 10100, fullPaise: 20000 }, 60000, s)).toEqual({ promoPaise: 5000, fullPaise: 20000, totalPaise: 25000 });
  });
  it("full-use money has no minimum order and works with promotions off", () => {
    expect(walletSplit({ promoPaise: 10100, fullPaise: 50000 }, 19900, s)).toEqual({ promoPaise: 0, fullPaise: 19900, totalPaise: 19900 });
    expect(walletSplit({ promoPaise: 10100, fullPaise: 5000 }, 50000, { ...s, enabled: false })).toEqual({ promoPaise: 0, fullPaise: 5000, totalPaise: 5000 });
  });
});
