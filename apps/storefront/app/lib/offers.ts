import { categories, coupons, offerTags, type createDatabase } from "@azadimart/database";
import { PRICE_DROP_TAG_DAYS } from "@azadimart/shared";
import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm";

type Db = ReturnType<typeof createDatabase>;

export type OfferTone = "SAFFRON" | "GREEN" | "RED" | "NAVY" | "PINK" | "PURPLE";
export type OfferBadge = { label: string; tone: OfferTone; kind: "tag" | "price_drop" };
export type OfferProduct = { id: string; categoryId: string; sellerId?: string | null; pricePaise: number; priceDroppedAt?: Date | string | null; priceBeforeDropPaise?: number | null };
export type CouponOffer = { code: string; text: string };

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** A product's "Price drop" if its price was lowered within the last few days and is still lower. */
export function priceDropOf(product: OfferProduct): { beforePaise: number; savedPaise: number } | null {
  if (!product.priceDroppedAt || !product.priceBeforeDropPaise) return null;
  const age = Date.now() - new Date(product.priceDroppedAt).getTime();
  if (age > PRICE_DROP_TAG_DAYS * 24 * 60 * 60 * 1000 || product.priceBeforeDropPaise <= product.pricePaise) return null;
  return { beforePaise: product.priceBeforeDropPaise, savedPaise: product.priceBeforeDropPaise - product.pricePaise };
}

/** Active offer tags and the category tree, loaded once per page. */
async function loadContext(db: Db) {
  const now = new Date();
  const [tags, cats] = await Promise.all([
    db.select({ label: offerTags.label, tone: offerTags.tone, scope: offerTags.scope, priority: offerTags.priority })
      .from(offerTags).where(and(eq(offerTags.isActive, true), lte(offerTags.startsAt, now), or(isNull(offerTags.endsAt), gt(offerTags.endsAt, now))))
      .orderBy(desc(offerTags.priority), desc(offerTags.createdAt)),
    db.select({ id: categories.id, parentId: categories.parentId }).from(categories),
  ]);
  const parentOf = new Map(cats.map((c) => [c.id, c.parentId]));
  return { tags, parentOf };
}

function tagsFor(product: OfferProduct, ctx: Awaited<ReturnType<typeof loadContext>>): OfferBadge[] {
  const family = new Set([product.categoryId, parentOfSafe(ctx.parentOf, product.categoryId)].filter(Boolean) as string[]);
  return ctx.tags
    .filter((t) => t.scope.allProducts || t.scope.productIds?.includes(product.id) || t.scope.categoryIds?.some((c) => family.has(c)))
    .map((t) => ({ label: t.label, tone: t.tone as OfferTone, kind: "tag" as const }));
}
const parentOfSafe = (map: Map<string, string | null>, id: string) => map.get(id) ?? null;

/**
 * The one badge each product card shows: the highest-priority admin offer tag,
 * else "Price drop" when the price was recently lowered.
 */
export async function loadCardBadges(db: Db, items: OfferProduct[]): Promise<Record<string, OfferBadge | null>> {
  if (!items.length) return {};
  const ctx = await loadContext(db);
  return Object.fromEntries(items.map((item) => {
    const tag = tagsFor(item, ctx)[0];
    if (tag) return [item.id, tag];
    return [item.id, priceDropOf(item) ? { label: "Price drop", tone: "GREEN", kind: "price_drop" } : null];
  }));
}

/** Everything the product page highlights: all offer tags, the price drop, and coupons that apply. */
export async function loadProductOffers(db: Db, product: OfferProduct & { sellerId: string }) {
  const ctx = await loadContext(db);
  const now = new Date();
  const rows = await db.select({
    code: coupons.code, discountType: coupons.discountType, discountValue: coupons.discountValue, minimumOrderPaise: coupons.minimumOrderPaise,
    maximumDiscountPaise: coupons.maximumDiscountPaise, firstOrderOnly: coupons.firstOrderOnly, scope: coupons.scope,
    usageLimit: coupons.usageLimit, usageCount: coupons.usageCount,
  }).from(coupons).where(and(eq(coupons.isActive, true), lte(coupons.startsAt, now), or(isNull(coupons.endsAt), gt(coupons.endsAt, now))))
    .orderBy(desc(coupons.discountValue)).limit(50);
  const family = new Set([product.categoryId, parentOfSafe(ctx.parentOf, product.categoryId)].filter(Boolean) as string[]);
  const applies = (scope: { productIds?: string[]; categoryIds?: string[]; sellerIds?: string[] }) => {
    const scoped = Boolean(scope.productIds?.length || scope.categoryIds?.length || scope.sellerIds?.length);
    return !scoped || Boolean(scope.productIds?.includes(product.id) || scope.categoryIds?.some((c) => family.has(c)) || scope.sellerIds?.includes(product.sellerId));
  };
  const couponOffers: CouponOffer[] = rows
    .filter((c) => (c.usageLimit === null || c.usageCount < c.usageLimit) && applies(c.scope))
    .slice(0, 3)
    .map((c) => {
      const what = c.discountType === "PERCENTAGE" ? `Extra ${c.discountValue}% off${c.maximumDiscountPaise ? ` (up to ${money(c.maximumDiscountPaise)})` : ""}`
        : c.discountType === "FIXED" ? `Flat ${money(c.discountValue)} off` : "Free delivery";
      const when = [c.minimumOrderPaise > 0 ? `on orders above ${money(c.minimumOrderPaise)}` : "", c.firstOrderOnly ? "on your first order" : ""].filter(Boolean).join(", ");
      return { code: c.code, text: when ? `${what} ${when}` : what };
    });
  return { tags: tagsFor(product, ctx), priceDrop: priceDropOf(product), coupons: couponOffers };
}
