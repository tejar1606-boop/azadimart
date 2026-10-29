/**
 * Compares a product's prices before and after an edit, size by size: selling
 * price, MRP and the discount they make, with warnings QC should look at.
 * Variants are matched by id, else by SKU.
 */
export type PricedVariant = { id?: string | null; sku: string; title: string; pricePaise: number; compareAtPaise: number | null };
export type PriceChangeRow = {
  key: string; sku: string; title: string;
  before: { pricePaise: number; compareAtPaise: number | null; discountPct: number } | null;
  after: { pricePaise: number; compareAtPaise: number | null; discountPct: number };
  changed: boolean;
  /** MRP went up: a bigger "discount" without a lower price can be a fake MRP. */
  mrpRaised: boolean;
  /** 70% or more off MRP: worth checking the MRP is genuine. */
  bigDiscount: boolean;
  isNew: boolean;
};

/** Seller discount (whole %) of a price against its MRP; 0 without a higher MRP. */
export const discountPct = (pricePaise: number, compareAtPaise: number | null) =>
  compareAtPaise && compareAtPaise > pricePaise ? Math.round(((compareAtPaise - pricePaise) / compareAtPaise) * 100) : 0;

export const BIG_DISCOUNT_PCT = 70;

export function comparePrices(before: PricedVariant[], after: PricedVariant[]): { rows: PriceChangeRow[]; changed: boolean; mrpRaised: boolean; discountBefore: number; discountAfter: number } {
  const rows = after.map((a, i): PriceChangeRow => {
    const b = (a.id ? before.find((v) => v.id === a.id) : undefined) ?? before.find((v) => v.sku.toUpperCase() === a.sku.toUpperCase());
    const afterPrice = { pricePaise: a.pricePaise, compareAtPaise: a.compareAtPaise ?? null, discountPct: discountPct(a.pricePaise, a.compareAtPaise ?? null) };
    const beforePrice = b ? { pricePaise: b.pricePaise, compareAtPaise: b.compareAtPaise ?? null, discountPct: discountPct(b.pricePaise, b.compareAtPaise ?? null) } : null;
    const changed = !beforePrice || beforePrice.pricePaise !== afterPrice.pricePaise || beforePrice.compareAtPaise !== afterPrice.compareAtPaise;
    const mrpRaised = Boolean(beforePrice && afterPrice.compareAtPaise && afterPrice.compareAtPaise > (beforePrice.compareAtPaise ?? beforePrice.pricePaise) && afterPrice.discountPct > beforePrice.discountPct);
    return { key: a.id ?? `new-${i}`, sku: a.sku, title: a.title, before: beforePrice, after: afterPrice, changed, mrpRaised, bigDiscount: afterPrice.discountPct >= BIG_DISCOUNT_PCT, isNew: !beforePrice };
  });
  const changedRows = rows.filter((r) => r.changed && !r.isNew);
  return {
    rows,
    changed: changedRows.length > 0,
    mrpRaised: rows.some((r) => r.mrpRaised),
    discountBefore: Math.max(0, ...changedRows.map((r) => r.before?.discountPct ?? 0)),
    discountAfter: Math.max(0, ...changedRows.map((r) => r.after.discountPct)),
  };
}
