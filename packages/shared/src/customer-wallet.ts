import { z } from "zod";

/**
 * Shopper wallet rules (Admin → Marketing → Wallet & welcome bonus). Money is
 * LOIMART's own: sellers are paid their full price, like a LOIMART coupon.
 */
export type WalletSettings = {
  enabled: boolean;
  /** Welcome bonus for a new shopper with a verified mobile. */
  bonusPaise: number;
  /** Most wallet money that can be used on one order, and the order value needed. */
  maxPerOrderPaise: number;
  minOrderPaise: number;
  /** Days before a welcome bonus expires. */
  expiryDays: number;
  /** Welcome bonuses allowed from one internet connection (IP) per day. */
  maxBonusesPerIpPerDay: number;
};
export const CUSTOMER_WALLET_KEY = "customer_wallet";
export const DEFAULT_WALLET_SETTINGS: WalletSettings = { enabled: true, bonusPaise: 10100, maxPerOrderPaise: 5000, minOrderPaise: 29900, expiryDays: 30, maxBonusesPerIpPerDay: 3 };
/** A cancelled order gives wallet money back with at least this long left to use it. */
export const WALLET_REFUND_GRACE_DAYS = 7;

const rupeesPaise = (max: number) => z.number().int().min(0).max(max);
export const walletSettingsSchema = z.object({
  enabled: z.boolean(),
  bonusPaise: rupeesPaise(1_000_00),
  maxPerOrderPaise: rupeesPaise(10_000_00),
  minOrderPaise: rupeesPaise(1_00_000_00),
  expiryDays: z.number().int().min(1).max(3650),
  maxBonusesPerIpPerDay: z.number().int().min(1).max(1000),
});

/** How much wallet money this order can use: up to the per-order limit, only on orders worth the minimum. */
export function walletUsable(balancePaise: number, orderValuePaise: number, s: Pick<WalletSettings, "enabled" | "maxPerOrderPaise" | "minOrderPaise">): number {
  if (!s.enabled || balancePaise <= 0 || orderValuePaise < s.minOrderPaise) return 0;
  return Math.max(0, Math.min(balancePaise, s.maxPerOrderPaise, orderValuePaise));
}

/** The device details the shop sends with a bonus claim (a random ID kept on the device + a hash of its characteristics). */
export const deviceSignalSchema = z.object({
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
