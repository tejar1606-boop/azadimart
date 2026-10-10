import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./columns";
import { reviewStatusEnum } from "./enums";
import { customers, users } from "./identity";
import { products } from "./catalog";
import { orderItems } from "./commerce";
import { mediaAssets } from "./cms";

/**
 * Customer ratings and reviews. Only customers with a delivered order for the
 * product can review (verified buyers), once per product; they may edit it.
 * Admins can hide a review; the product's seller can post one public reply.
 */
export const productReviews = pgTable(
  "product_reviews",
  {
    id,
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    // The delivered purchase that made this a verified review.
    orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id),
    rating: integer("rating").notNull(),
    title: text("title"),
    body: text("body"),
    status: reviewStatusEnum("status").notNull().default("PUBLISHED"),
    hiddenReason: text("hidden_reason"),
    hiddenByUserId: uuid("hidden_by_user_id").references(() => users.id),
    sellerReply: text("seller_reply"),
    sellerRepliedAt: timestamp("seller_replied_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_reviews_product_customer_unique").on(table.productId, table.customerId),
    index("product_reviews_product_status_idx").on(table.productId, table.status),
    index("product_reviews_customer_idx").on(table.customerId),
    check("product_reviews_rating_range", sql`${table.rating} between 1 and 5`),
  ],
);

/** Up to 4 customer photos per review. */
export const productReviewMedia = pgTable(
  "product_review_media",
  {
    id,
    reviewId: uuid("review_id").notNull().references(() => productReviews.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id").notNull().references(() => mediaAssets.id),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [index("product_review_media_review_idx").on(table.reviewId)],
);
