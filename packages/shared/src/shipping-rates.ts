/**
 * LOIMART shipping rate card: what a seller pays (taken from their payout)
 * when LOIMART books the courier. By weight, in 500 g slabs, and by zone:
 * same city, same state, or anywhere else in India. Cash on Delivery adds a
 * collection fee. Prices include GST. Change the numbers here to update the
 * rate card everywhere (seller settings, booking and payouts).
 */
export const LOIMART_RATE_CARD = {
  local: { first500g: 3500, extra500g: 2500, label: "Same city" },
  regional: { first500g: 4500, extra500g: 3500, label: "Same state" },
  national: { first500g: 6000, extra500g: 4500, label: "Rest of India" },
  codFeePaise: 2500,
} as const;

export type ShippingZone = "local" | "regional" | "national";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function shippingZone(from: { city: string; state: string }, to: { city: string; state: string }): ShippingZone {
  if (norm(from.state) && norm(from.state) === norm(to.state)) return norm(from.city) && norm(from.city) === norm(to.city) ? "local" : "regional";
  return "national";
}

/** Fee in paise for one parcel. */
export function loimartShippingFee(input: { weightGrams: number; zone: ShippingZone; cod: boolean }): number {
  const rate = LOIMART_RATE_CARD[input.zone];
  const slabs = Math.max(1, Math.ceil(Math.max(1, input.weightGrams) / 500));
  return rate.first500g + (slabs - 1) * rate.extra500g + (input.cod ? LOIMART_RATE_CARD.codFeePaise : 0);
}

/**
 * Who pays delivery. Orders whose items (after offers) come to ₹301 or more
 * ship free for the shopper and the seller pays the courier (taken from their
 * payout). Below ₹301 the shopper pays the courier charge at checkout and the
 * seller pays nothing for that parcel.
 */
export const FREE_DELIVERY_FROM_PAISE = 30_100;
export const customerPaysDelivery = (itemsValuePaise: number) => itemsValuePaise > 0 && itemsValuePaise < FREE_DELIVERY_FROM_PAISE;

/** Courier charge for a shopper's order: one parcel per seller, from the seller's pickup address. */
export function deliveryChargeFor(parcels: Array<{ weightGrams: number; from: { city: string; state: string } }>, to: { city: string; state: string }, cod: boolean): number {
  return parcels.reduce((sum, p) => sum + loimartShippingFee({ weightGrams: p.weightGrams, zone: shippingZone(p.from, to), cod }), 0);
}

/** Why a shopper can return an item (the storefront's choices; the first part of returns.reason). */
export const RETURN_REASONS = ["Damaged or defective", "Wrong item sent", "Size or fit issue", "Doesn't match the description or photos", "Missing parts or accessories", "Quality not as expected"] as const;
/** The seller's mistake: they pay the whole return pickup. */
export const SELLER_FAULT_RETURN_REASONS: readonly string[] = ["Damaged or defective", "Wrong item sent", "Doesn't match the description or photos", "Missing parts or accessories"];
export const returnIsSellerFault = (reason: string | null | undefined) => SELLER_FAULT_RETURN_REASONS.some((r) => (reason ?? "").trim().startsWith(r));

/**
 * Return pickups: the seller pays all of it when the return is their fault
 * (damaged, wrong item, not as described, missing parts); otherwise LOIMART
 * pays 40% and the seller 60%. The seller's part comes off their payout.
 */
export const RETURN_SHIPPING_LOIMART_SHARE_BPS = 4_000;
export function splitReturnShipping(feePaise: number, sellerFault = false): { loimartPaise: number; sellerPaise: number } {
  const fee = Math.max(0, Math.round(feePaise));
  const loimartPaise = sellerFault ? 0 : Math.round((fee * RETURN_SHIPPING_LOIMART_SHARE_BPS) / 10_000);
  return { loimartPaise, sellerPaise: fee - loimartPaise };
}
