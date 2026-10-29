import { z } from "zod";

/**
 * Seller advertising: admins create ad slots (e.g. the home page hero
 * banner) with a starting price per day, an optional "Book now" price, a
 * minimum bid step and a bidding cut-off. Each day of a slot is its own
 * auction: the highest bid when bidding closes wins and the day is blocked
 * for everyone else; "Book now" takes the day instantly. Days are calendar
 * days in India time (IST).
 */
export const AD_PLACEMENTS = ["HOME_HERO", "HOME_PRODUCTS", "SEARCH_TOP", "CATEGORY_TOP"] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];
export const AD_PLACEMENT_LABELS: Record<AdPlacement, string> = {
  HOME_HERO: "Home page main banner",
  HOME_PRODUCTS: "Sponsored products row on the home page",
  SEARCH_TOP: "First product in search results and All products",
  CATEGORY_TOP: "First product on a category page",
};
/** Only the home page banner needs a banner image; product placements show the product card. */
export const adNeedsBanner = (placement: string) => placement === "HOME_HERO";

/** LOIMART's ad fee carries 18% GST (confirm with the CA). */
export const AD_GST_BPS = 1800;
export function adChargeFor(basePaise: number) {
  const gstPaise = Math.round((basePaise * AD_GST_BPS) / 10_000);
  return { basePaise, gstPaise, totalPaise: basePaise + gstPaise };
}
/** A seller may owe this much in ads beyond their upcoming earnings, unless an admin sets their own limit. */
export const AD_DEFAULT_CREDIT_LIMIT_PAISE = 5_000_00;
export const adCreditLimitSchema = z.object({ limitPaise: z.number().int().min(0).max(1_00_00_000_00).nullable() });
export const AD_BOOKING_DAYS_AHEAD = 60;
export const AD_MAX_DAYS_PER_REQUEST = 14;

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-14" for the India-time calendar day containing this moment. */
export function istDayKey(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
/** The moment an India-time day starts (00:00 IST). */
export function istDayStart(dayKey: string): Date {
  return new Date(Date.parse(dayKey + "T00:00:00Z") - IST_OFFSET_MS);
}
export function addDays(dayKey: string, days: number): string {
  return new Date(Date.parse(dayKey + "T00:00:00Z") + days * DAY_MS).toISOString().slice(0, 10);
}
/** Bidding for a day stops this many hours before the day begins. */
export function biddingClosesAt(dayKey: string, closeHoursBefore: number): Date {
  return new Date(istDayStart(dayKey).getTime() - closeHoursBefore * 60 * 60 * 1000);
}
/** Lowest acceptable bid: the starting price, or the current top bid plus the step. */
export function minimumNextBid(slot: { basePricePaise: number; bidIncrementPaise: number }, topBidPaise: number | null): number {
  return topBidPaise == null ? slot.basePricePaise : topBidPaise + slot.bidIncrementPaise;
}

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use dates like 2026-10-14").refine((v) => !Number.isNaN(Date.parse(v + "T00:00:00Z")), "Invalid date");
const rupees = (min: number, label: string) => z.number().int().min(min, `${label} must be at least ₹${min / 100}`).max(1_00_00_000_00, `${label} is too high`);

export const adSlotSchema = z.object({
  name: z.string().trim().min(3).max(60),
  placement: z.enum(AD_PLACEMENTS),
  categoryId: z.string().uuid().nullable().optional().default(null),
  description: z.string().trim().max(300).optional().default(""),
  basePricePaise: rupees(100, "Starting price"),
  buyNowPricePaise: rupees(100, "Book-now price").nullable().optional().default(null),
  bidIncrementPaise: rupees(100, "Bid step"),
  closeHoursBefore: z.number().int().min(1).max(168),
  isActive: z.boolean().default(true),
}).refine((s) => s.buyNowPricePaise == null || s.buyNowPricePaise >= s.basePricePaise, { message: "Book-now price must be at least the starting price", path: ["buyNowPricePaise"] })
  .refine((s) => (s.placement === "CATEGORY_TOP") === Boolean(s.categoryId), { message: "Choose the category for a category placement (and only then)", path: ["categoryId"] });

export const adSlotClosedDaysSchema = z.object({ days: z.array(dayKeySchema).min(1).max(60), closed: z.boolean() });

export const adCampaignSchema = z.object({
  slotId: z.string().uuid(),
  productId: z.string().uuid(),
  headline: z.string().trim().min(3, "Add a short headline").max(60),
  desktopImageAssetId: z.string().uuid().nullable().optional().default(null),
  mobileImageAssetId: z.string().uuid().nullable().optional().default(null),
});

/**
 * Free ad days (a seller's reward for referring another seller): one day of a
 * product ad for one product, at no cost. Only in product placements, only on
 * a day nobody has bid on or booked, never on festival/sale days that LOIMART
 * marks (platform setting AD_FESTIVAL_DAYS_KEY), and only for an approved ad.
 */
export const FREE_AD_PLACEMENTS: readonly AdPlacement[] = ["HOME_PRODUCTS", "SEARCH_TOP", "CATEGORY_TOP"];
export const AD_FESTIVAL_DAYS_KEY = "ad_festival_days";
export const FREE_AD_DAY_TERMS = [
  "One free ad day = one day of a product ad (Sponsored products row, top of search or top of a category) for one of your products.",
  "Use it on any day in the next 60 days that is still open: no other seller has bid on or booked it.",
  "Not on festival and sale days that LOIMART marks as special (shown as ★ in the calendar).",
  "Your ad must be approved by LOIMART first. Once used, the day is yours and isn't charged.",
  "A free ad gives your product more visibility and a better chance of getting more orders; it doesn't guarantee orders or sales.",
  "Free ad days have no cash value and can't be transferred to another seller.",
] as const;

export const adFestivalDaysSchema = z.object({ days: z.array(dayKeySchema).max(366).refine((d) => new Set(d).size === d.length, "Each day only once") });

export const adBidSchema = z.object({
  campaignId: z.string().uuid(),
  days: z.array(dayKeySchema).min(1, "Pick at least one day").max(AD_MAX_DAYS_PER_REQUEST, `Pick at most ${AD_MAX_DAYS_PER_REQUEST} days at a time`)
    .refine((d) => new Set(d).size === d.length, "Each day only once"),
  mode: z.enum(["BID", "BUY_NOW", "FREE"]),
  amountPaise: z.number().int().positive().optional(), // per day; required for BID
}).refine((b) => b.mode !== "BID" || (b.amountPaise ?? 0) > 0, { message: "Enter your bid per day", path: ["amountPaise"] })
  .refine((b) => b.mode !== "FREE" || b.days.length === 1, { message: "A free ad day is for one day: pick just one", path: ["days"] });
