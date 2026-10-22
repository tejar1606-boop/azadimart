/**
 * Seller settlement rules: what LOIMART keeps and what the seller is paid
 * for their part of an order. All amounts are in paise.
 *
 * - Commission: free for the seller's first 3 months after approval (by
 *   order date), then 5% of the seller's order value, plus 18% GST on the
 *   commission (a service LOIMART charges).
 * - TCS under GST section 52 (0.5% of the net taxable value) applies to
 *   GST-registered sellers only.
 * - TDS under Income-tax section 194-O (0.1% of the gross amount).
 * - Paid out 7 days after delivery if no return is open.
 * Tax rates must be confirmed with LOIMART's CA before going live.
 */
export const COMMISSION_FREE_MONTHS = 3;
export const COMMISSION_RATE_BPS = 500; // 5%
export const GST_ON_FEES_BPS = 1800; // 18%
export const TCS_RATE_BPS = 50; // 0.5%
export const TDS_RATE_BPS = 10; // 0.1%
export const PAYOUT_HOLD_DAYS = 7;

const bps = (paise: number, rate: number) => Math.round((paise * rate) / 10_000);

/** End of the commission-free period: 3 calendar months after approval. */
export function commissionFreeUntil(approvedAt: Date): Date {
  const end = new Date(approvedAt);
  end.setMonth(end.getMonth() + COMMISSION_FREE_MONTHS);
  return end;
}

export type SettlementInput = {
  grossPaise: number; // the seller's item value in the order (price × quantity)
  sellerDiscountPaise?: number; // coupon discount on these items that the seller pays
  taxableValuePaise?: number; // value without GST, when known; TCS is charged on this
  orderedAt: Date;
  sellerApprovedAt: Date | null;
  gstRegistered: boolean;
  /** LOIMART shipping fee for the parcel (on its first item), when LOIMART shipped it. */
  shippingFeePaise?: number;
  /** The order falls in an extra commission-free period (e.g. 3 months earned by a referral). */
  inBonusFreePeriod?: boolean;
};
export type SettlementBreakdown = {
  grossPaise: number;
  /** Coupon discount the seller pays; commission and taxes are on the price after it. */
  sellerDiscountPaise: number;
  commissionFree: boolean;
  commissionRateBps: number;
  commissionPaise: number;
  gstOnCommissionPaise: number;
  tcsPaise: number;
  tdsPaise: number;
  /** LOIMART shipping fee (incl. GST) taken from the payout. */
  shippingFeePaise: number;
  netPaise: number;
};

export function calculateSettlement(input: SettlementInput): SettlementBreakdown {
  const gross = Math.max(0, Math.round(input.grossPaise));
  const sellerDiscount = Math.min(gross, Math.max(0, Math.round(input.sellerDiscountPaise ?? 0)));
  // What the customer actually paid for these items: commission and taxes are worked out on this.
  const sold = gross - sellerDiscount;
  // A seller without an approval date hasn't started the free period, so it's treated as free.
  const commissionFree = !input.sellerApprovedAt || input.orderedAt < commissionFreeUntil(input.sellerApprovedAt) || Boolean(input.inBonusFreePeriod);
  const commissionRateBps = commissionFree ? 0 : COMMISSION_RATE_BPS;
  const commissionPaise = bps(sold, commissionRateBps);
  const gstOnCommissionPaise = bps(commissionPaise, GST_ON_FEES_BPS);
  const tcsPaise = input.gstRegistered ? bps(input.taxableValuePaise ?? sold, TCS_RATE_BPS) : 0;
  const tdsPaise = bps(sold, TDS_RATE_BPS);
  const shippingFeePaise = Math.max(0, Math.round(input.shippingFeePaise ?? 0));
  return { grossPaise: gross, sellerDiscountPaise: sellerDiscount, commissionFree, commissionRateBps, commissionPaise, gstOnCommissionPaise, tcsPaise, tdsPaise, shippingFeePaise, netPaise: sold - commissionPaise - gstOnCommissionPaise - tcsPaise - tdsPaise - shippingFeePaise };
}

/** When a delivered item's money can be paid out. */
export const payoutEligibleAt = (deliveredAt: Date) => new Date(deliveredAt.getTime() + PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000);

/** Each successful seller referral earns the referrer this many extra commission-free months, up to the cap. */
export const REFERRAL_BONUS_MONTHS = 3;
export const REFERRAL_MAX_REWARDS = 4;

/**
 * Settlement cycles: by default sellers are paid every 15 days, on the 1st and
 * the 16th (India time), for everything whose return window closed in the
 * cycle before. "DAILY" pays every day (Admin → Finance can switch).
 */
export type SettlementCycle = "FORTNIGHTLY" | "DAILY";
export const SETTLEMENT_CYCLE_KEY = "settlement_cycle";
export const DEFAULT_SETTLEMENT_CYCLE: SettlementCycle = "FORTNIGHTLY";
const IST_MS = 330 * 60_000;
const istMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - IST_MS);

/** Start of the cycle `now` falls in: the 1st or 16th at midnight India time (DAILY: today's midnight). */
export function settlementCycleStart(now: Date, cycle: SettlementCycle = DEFAULT_SETTLEMENT_CYCLE): Date {
  const ist = new Date(now.getTime() + IST_MS);
  const [y, m, d] = [ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()];
  if (cycle === "DAILY") return istMidnight(y, m, d);
  return istMidnight(y, m, d >= 16 ? 16 : 1);
}
/** Start of the cycle before the one starting at `start`. */
export function previousCycleStart(start: Date, cycle: SettlementCycle = DEFAULT_SETTLEMENT_CYCLE): Date {
  return settlementCycleStart(new Date(start.getTime() - 60_000), cycle);
}
/** The next settlement day after `now` (1st or 16th, India time). */
export function nextSettlementDate(now: Date, cycle: SettlementCycle = DEFAULT_SETTLEMENT_CYCLE): Date {
  // A day (or 17 days) past the current cycle's start always lands in the next cycle.
  const start = settlementCycleStart(now, cycle);
  return settlementCycleStart(new Date(start.getTime() + (cycle === "DAILY" ? 25 : 17 * 24) * 3600_000), cycle);
}

/** LOIMART's fee invoices to sellers: one series per financial year, e.g. "LMS/2627/000001". */
export const feeInvoiceNumber = (financialYear: string, sequence: number) => `LMS/${financialYear.replace("-", "").slice(2)}/${String(sequence).padStart(6, "0")}`;
/** SAC codes for LOIMART's services (confirm with the CA). */
export const FEE_SAC = { COMMISSION: "998599", COURIER: "996812", ADS: "998365" } as const;
