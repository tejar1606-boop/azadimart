/**
 * Seller settlement rules: what AzadiMart keeps and what the seller is paid
 * for their part of an order. All amounts are in paise.
 *
 * - Commission: free for the seller's first 3 months after approval (by
 *   order date), then 5% of the seller's order value, plus 18% GST on the
 *   commission (a service AzadiMart charges).
 * - TCS under GST section 52 (0.5% of the net taxable value) applies to
 *   GST-registered sellers only.
 * - TDS under Income-tax section 194-O (0.1% of the gross amount).
 * - Paid out 7 days after delivery if no return is open.
 * Tax rates must be confirmed with AzadiMart's CA before going live.
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
  grossPaise: number; // the seller's item value in the order (what the customer paid for those items)
  taxableValuePaise?: number; // value without GST, when known; TCS is charged on this
  orderedAt: Date;
  sellerApprovedAt: Date | null;
  gstRegistered: boolean;
};
export type SettlementBreakdown = {
  grossPaise: number;
  commissionFree: boolean;
  commissionRateBps: number;
  commissionPaise: number;
  gstOnCommissionPaise: number;
  tcsPaise: number;
  tdsPaise: number;
  netPaise: number;
};

export function calculateSettlement(input: SettlementInput): SettlementBreakdown {
  const gross = Math.max(0, Math.round(input.grossPaise));
  // A seller without an approval date hasn't started the free period, so it's treated as free.
  const commissionFree = !input.sellerApprovedAt || input.orderedAt < commissionFreeUntil(input.sellerApprovedAt);
  const commissionRateBps = commissionFree ? 0 : COMMISSION_RATE_BPS;
  const commissionPaise = bps(gross, commissionRateBps);
  const gstOnCommissionPaise = bps(commissionPaise, GST_ON_FEES_BPS);
  const tcsPaise = input.gstRegistered ? bps(input.taxableValuePaise ?? gross, TCS_RATE_BPS) : 0;
  const tdsPaise = bps(gross, TDS_RATE_BPS);
  return { grossPaise: gross, commissionFree, commissionRateBps, commissionPaise, gstOnCommissionPaise, tcsPaise, tdsPaise, netPaise: gross - commissionPaise - gstOnCommissionPaise - tcsPaise - tdsPaise };
}

/** When a delivered item's money can be paid out. */
export const payoutEligibleAt = (deliveredAt: Date) => new Date(deliveredAt.getTime() + PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000);
