import { z } from "zod";

/**
 * Cashback on every order: a percentage of what the shopper pays for the
 * items (after any offer), up to a maximum, added to their LOIMART wallet
 * once the order is delivered and kept past the return window (no return or
 * replacement). Each seller pays the part for their items, taken from that
 * order's payout, and only when the shopper actually gets it. Admin → Wallet
 * & referrals sets it. GST treatment must be confirmed with the CA.
 */
export type CashbackSettings = { enabled: boolean; percentBps: number; maxPaise: number };
export const ORDER_CASHBACK_KEY = "order_cashback";
export const DEFAULT_ORDER_CASHBACK: CashbackSettings = { enabled: true, percentBps: 200, maxPaise: 50_00 };
export const cashbackSettingsSchema = z.object({
  enabled: z.boolean(),
  percentBps: z.number().int().min(0).max(20_00),
  maxPaise: z.number().int().min(0).max(1_000_00),
});

/** Cashback for an order whose items cost `itemsPaise` after offers, in whole rupees (0 when switched off). */
export function cashbackFor(s: CashbackSettings, itemsPaise: number): number {
  if (!s.enabled || s.percentBps <= 0 || itemsPaise <= 0) return 0;
  const raw = Math.floor((itemsPaise * s.percentBps) / 10_000);
  const capped = s.maxPaise > 0 ? Math.min(raw, s.maxPaise) : raw;
  return Math.floor(capped / 100) * 100;
}

/** Splits an order's cashback across its lines in proportion to what each costs (exact, largest remainder). */
export function splitCashback(totalPaise: number, linePaise: number[]): number[] {
  const sum = linePaise.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0 || totalPaise <= 0) return linePaise.map(() => 0);
  const raw = linePaise.map((w) => (totalPaise * Math.max(0, w)) / sum);
  const out = raw.map(Math.floor);
  let left = totalPaise - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; out[i]! += 1; left--; }
  return out;
}

/** Shown to shoppers in a short line: "2% cashback, up to ₹50". */
export const cashbackRuleText = (s: CashbackSettings) =>
  `${(s.percentBps / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}% cashback${s.maxPaise > 0 ? `, up to ₹${(s.maxPaise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : ""}`;

/** What shoppers are told when they tap the cashback. */
export const CASHBACK_EXPLAINER = "Added to your LOIMART wallet after delivery, once the return window closes and nothing in the order is returned or replaced. Use it on your next order.";
