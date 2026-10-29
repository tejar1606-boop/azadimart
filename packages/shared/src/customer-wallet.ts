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
  /** Refer & earn: a shopper with an order of their own gets this when a friend they invited has their first order delivered. */
  referralEnabled: boolean;
  referralRewardPaise: number;
  /** Most referral rewards one shopper can earn (0 = no limit). */
  maxReferralRewards: number;
};
export const CUSTOMER_WALLET_KEY = "customer_wallet";
export const DEFAULT_WALLET_SETTINGS: WalletSettings = { enabled: true, bonusPaise: 10100, maxPerOrderPaise: 5000, minOrderPaise: 29900, expiryDays: 30, maxBonusesPerIpPerDay: 3, referralEnabled: true, referralRewardPaise: 10100, maxReferralRewards: 50 };
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
  referralEnabled: z.boolean().default(DEFAULT_WALLET_SETTINGS.referralEnabled),
  referralRewardPaise: rupeesPaise(1_000_00).default(DEFAULT_WALLET_SETTINGS.referralRewardPaise),
  maxReferralRewards: z.number().int().min(0).max(100_000).default(DEFAULT_WALLET_SETTINGS.maxReferralRewards),
});

/** How much wallet money this order can use: up to the per-order limit, only on orders worth the minimum. */
export function walletUsable(balancePaise: number, orderValuePaise: number, s: Pick<WalletSettings, "enabled" | "maxPerOrderPaise" | "minOrderPaise">): number {
  if (!s.enabled || balancePaise <= 0 || orderValuePaise < s.minOrderPaise) return 0;
  return Math.max(0, Math.min(balancePaise, s.maxPerOrderPaise, orderValuePaise));
}

/**
 * Wallet money for one order. Promotional money (welcome bonus, referral,
 * cashback) follows the limit above and is used first; money LOIMART staff
 * added or a cancelled order refunded to the wallet (`fullPaise`) has no limit
 * and works even while promotions are switched off, up to the order's value.
 */
export function walletSplit(balance: { promoPaise: number; fullPaise: number }, orderValuePaise: number, s: Pick<WalletSettings, "enabled" | "maxPerOrderPaise" | "minOrderPaise">) {
  const promoPaise = walletUsable(balance.promoPaise, orderValuePaise, s);
  const fullPaise = Math.max(0, Math.min(balance.fullPaise, orderValuePaise - promoPaise));
  return { promoPaise, fullPaise, totalPaise: promoPaise + fullPaise };
}

/** Staff adding money to a shopper's wallet (Admin → customer). */
export const walletCreditSchema = z.object({
  amountPaise: z.number().int().min(100, "Add at least ₹1").max(50_000_00, "Add at most ₹50,000 at a time"),
  reason: z.string().trim().min(3, "Give a reason (the customer sees it)").max(200),
  orderNumber: z.string().trim().max(40).optional().default(""),
  /** 0 = never expires. */
  expiryDays: z.number().int().min(0).max(3650).default(0),
});

/** Where a cancelled prepaid order's money goes: the wallet (instant) or back to the card/UPI/bank it came from. */
export const REFUND_DESTINATIONS = ["WALLET", "SOURCE"] as const;
export type RefundDestination = (typeof REFUND_DESTINATIONS)[number];

/** The device details the shop sends with a bonus claim (a random ID kept on the device + a hash of its characteristics). */
export const deviceSignalSchema = z.object({
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
