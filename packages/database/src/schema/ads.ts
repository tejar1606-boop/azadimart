import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./columns";
import { users } from "./identity";
import { sellers } from "./sellers";
import { products } from "./catalog";
import { mediaAssets } from "./cms";
import { payouts } from "./fulfillment";

/** A place sellers can advertise in (e.g. the home page main banner), priced per day by admins. */
export const adSlots = pgTable("ad_slots", {
  id,
  name: text("name").notNull(),
  placement: text("placement").notNull(),
  description: text("description").notNull().default(""),
  basePricePaise: integer("base_price_paise").notNull(),
  buyNowPricePaise: integer("buy_now_price_paise"),
  bidIncrementPaise: integer("bid_increment_paise").notNull(),
  closeHoursBefore: integer("close_hours_before").notNull().default(12),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

/** Days an admin has taken off sale for a slot. */
export const adSlotClosedDays = pgTable("ad_slot_closed_days", {
  id,
  slotId: uuid("slot_id").notNull().references(() => adSlots.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  ...timestamps,
}, (t) => [uniqueIndex("ad_slot_closed_days_unique").on(t.slotId, t.day)]);

/** What a seller advertises: a product, a banner and a headline. Admin approves it before it runs. */
export const adCampaigns = pgTable("ad_campaigns", {
  id,
  sellerId: uuid("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
  slotId: uuid("slot_id").notNull().references(() => adSlots.id),
  productId: uuid("product_id").notNull().references(() => products.id),
  headline: text("headline").notNull(),
  desktopImageAssetId: uuid("desktop_image_asset_id").notNull().references(() => mediaAssets.id),
  mobileImageAssetId: uuid("mobile_image_asset_id").references(() => mediaAssets.id),
  status: text("status").$type<"PENDING_REVIEW" | "APPROVED" | "REJECTED">().notNull().default("PENDING_REVIEW"),
  reviewNote: text("review_note"),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...timestamps,
}, (t) => [index("ad_campaigns_seller_idx").on(t.sellerId)]);

/**
 * A seller's offer for one day of a slot. ACTIVE = current top bid while
 * bidding is open; OUTBID = beaten; WON = the day is theirs (bidding closed
 * or booked instantly); LOST = bidding closed and someone else won;
 * CANCELLED = withdrawn by an admin. One WON bid per slot and day.
 */
export const adBids = pgTable("ad_bids", {
  id,
  slotId: uuid("slot_id").notNull().references(() => adSlots.id),
  campaignId: uuid("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  sellerId: uuid("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  kind: text("kind").$type<"BID" | "BUY_NOW">().notNull(),
  status: text("status").$type<"ACTIVE" | "OUTBID" | "WON" | "LOST" | "CANCELLED">().notNull(),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  ...timestamps,
}, (t) => [
  index("ad_bids_slot_day_idx").on(t.slotId, t.day),
  index("ad_bids_seller_idx").on(t.sellerId),
  uniqueIndex("ad_bids_one_winner").on(t.slotId, t.day).where(sql`status = 'WON'`),
  uniqueIndex("ad_bids_one_top").on(t.slotId, t.day).where(sql`status = 'ACTIVE'`),
]);

/** Money a seller owes AzadiMart (ads), taken from their next payouts. */
export const sellerCharges = pgTable("seller_charges", {
  id,
  sellerId: uuid("seller_id").notNull().references(() => sellers.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"AD">().notNull(),
  referenceId: uuid("reference_id").notNull(),
  description: text("description").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  status: text("status").$type<"PENDING" | "SETTLED" | "WAIVED">().notNull().default("PENDING"),
  payoutId: uuid("payout_id").references(() => payouts.id),
  ...timestamps,
}, (t) => [
  uniqueIndex("seller_charges_reference_unique").on(t.kind, t.referenceId),
  index("seller_charges_seller_status_idx").on(t.sellerId, t.status),
]);
