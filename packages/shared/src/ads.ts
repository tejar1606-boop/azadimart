import { z } from "zod";

/**
 * Seller advertising: admins create ad slots (e.g. the home page hero
 * banner) with a starting price per day, an optional "Book now" price, a
 * minimum bid step and a bidding cut-off. Each day of a slot is its own
 * auction: the highest bid when bidding closes wins and the day is blocked
 * for everyone else; "Book now" takes the day instantly. Days are calendar
 * days in India time (IST).
 */
export const AD_PLACEMENTS = ["HOME_HERO"] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];
export const AD_PLACEMENT_LABELS: Record<AdPlacement, string> = { HOME_HERO: "Home page main banner" };
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
  description: z.string().trim().max(300).optional().default(""),
  basePricePaise: rupees(100, "Starting price"),
  buyNowPricePaise: rupees(100, "Book-now price").nullable().optional().default(null),
  bidIncrementPaise: rupees(100, "Bid step"),
  closeHoursBefore: z.number().int().min(1).max(168),
  isActive: z.boolean().default(true),
}).refine((s) => s.buyNowPricePaise == null || s.buyNowPricePaise >= s.basePricePaise, { message: "Book-now price must be at least the starting price", path: ["buyNowPricePaise"] });

export const adSlotClosedDaysSchema = z.object({ days: z.array(dayKeySchema).min(1).max(60), closed: z.boolean() });

export const adCampaignSchema = z.object({
  slotId: z.string().uuid(),
  productId: z.string().uuid(),
  headline: z.string().trim().min(3, "Add a short headline").max(60),
  desktopImageAssetId: z.string().uuid(),
  mobileImageAssetId: z.string().uuid().nullable().optional().default(null),
});

export const adBidSchema = z.object({
  campaignId: z.string().uuid(),
  days: z.array(dayKeySchema).min(1, "Pick at least one day").max(AD_MAX_DAYS_PER_REQUEST, `Pick at most ${AD_MAX_DAYS_PER_REQUEST} days at a time`)
    .refine((d) => new Set(d).size === d.length, "Each day only once"),
  mode: z.enum(["BID", "BUY_NOW"]),
  amountPaise: z.number().int().positive().optional(), // per day; required for BID
}).refine((b) => b.mode === "BUY_NOW" || (b.amountPaise ?? 0) > 0, { message: "Enter your bid per day", path: ["amountPaise"] });
