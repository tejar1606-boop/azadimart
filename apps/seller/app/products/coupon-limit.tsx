"use client";

import { COUPON_DISCOUNT_CHOICES } from "@azadimart/shared";

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const couponLimitLabel = (pct: number) => (pct > 0 ? `Up to ${pct}% off` : "Not in LOIMART coupons");

/** Dropdown for "LOIMART coupons may take up to …% off this product". */
export function CouponLimitSelect({ value, onChange, disabled, compact = false, id }: { value: number; onChange: (pct: number) => void; disabled?: boolean; compact?: boolean; id?: string }) {
  return (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-label="Maximum LOIMART coupon discount"
      className={compact ? "rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-7 text-[11px] font-semibold text-slate-700" : "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"}>
      {COUPON_DISCOUNT_CHOICES.map((pct) => <option key={pct} value={pct}>{pct === 0 ? (compact ? "Coupons: off" : "Don't include in LOIMART coupons") : compact ? `Coupons: up to ${pct}%` : `Allow coupons up to ${pct}% off`}</option>)}
    </select>
  );
}

/** What the setting means, with an example on the seller's own price. */
export function CouponLimitHelp({ pct, pricePaise }: { pct: number; pricePaise: number | null }) {
  return (
    <p className="mt-2 text-xs leading-5 text-slate-500">
      LOIMART runs coupons like &ldquo;10% off&rdquo; to bring you more buyers. Your product joins a coupon only if it&apos;s within the limit you set, and the
      discount is taken from your payout for that order (commission is charged on the lower price).
      {pct > 0 && pricePaise ? <> Example: on your price of {money(pricePaise)}, the most a coupon can cost you is <b>{money(Math.floor((pricePaise * pct) / 100))}</b>.</> : null}
      {pct === 0 ? " With coupons off, LOIMART's own coupons can still apply at no cost to you." : null}
    </p>
  );
}
