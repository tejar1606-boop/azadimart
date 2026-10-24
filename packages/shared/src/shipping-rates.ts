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
