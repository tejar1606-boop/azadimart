import { deliveryChargeFor, loimartShippingFee, shippingZone, type ShippingZone } from "@azadimart/shared";
import { eq, inArray } from "drizzle-orm";
import type { createDatabase } from "./client";
import { productVariants, products, sellerSettings, sellers } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Place = { city: string; state: string };

/** Where each seller's parcels start: their pickup address, else their business state. */
export async function sellerPickupPlaces(db: Db | Tx, sellerIds: string[]): Promise<Map<string, Place>> {
  if (!sellerIds.length) return new Map();
  const rows = await db.select({ id: sellers.id, businessState: sellers.businessState, shipping: sellerSettings.shippingSettings })
    .from(sellers).leftJoin(sellerSettings, eq(sellerSettings.sellerId, sellers.id)).where(inArray(sellers.id, [...new Set(sellerIds)]));
  return new Map(rows.map((r) => {
    const pickup = (r.shipping as { pickup?: { city?: string; state?: string } } | null)?.pickup;
    return [r.id, { city: pickup?.city ?? "", state: pickup?.state || (r.businessState ?? "") }];
  }));
}

/**
 * The courier charge for these items to an address, one parcel per seller
 * (LOIMART rate card: weight, distance, Cash on Delivery). The shopper pays it
 * only on orders under ₹301 (see customerPaysDelivery).
 */
export async function deliveryQuote(db: Db | Tx, input: { lines: Array<{ variantId: string; quantity: number }>; to: Place; cod: boolean }) {
  if (!input.lines.length) return { feePaise: 0, parcels: 0 };
  const variants = await db.select({ id: productVariants.id, weightGrams: productVariants.weightGrams, sellerId: products.sellerId })
    .from(productVariants).innerJoin(products, eq(products.id, productVariants.productId)).where(inArray(productVariants.id, input.lines.map((l) => l.variantId)));
  const weights = new Map<string, number>();
  for (const line of input.lines) {
    const v = variants.find((x) => x.id === line.variantId);
    if (v) weights.set(v.sellerId, (weights.get(v.sellerId) ?? 0) + (v.weightGrams ?? 0) * line.quantity);
  }
  const places = await sellerPickupPlaces(db, [...weights.keys()]);
  const parcels = [...weights].map(([sellerId, weightGrams]) => ({ weightGrams, from: places.get(sellerId) ?? { city: "", state: "" } }));
  return { feePaise: deliveryChargeFor(parcels, input.to, input.cod), parcels: parcels.length };
}

/** Courier charge for picking a return up from the shopper and taking it back to the seller (no COD fee). */
export function returnPickupFee(input: { weightGrams: number; seller: Place; customer: Place }): { zone: ShippingZone; feePaise: number } {
  const zone = shippingZone(input.customer, input.seller);
  return { zone, feePaise: loimartShippingFee({ weightGrams: input.weightGrams, zone, cod: false }) };
}
