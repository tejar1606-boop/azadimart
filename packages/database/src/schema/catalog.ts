import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";

/** A seller's pending edit to a live product (see qcSubmissions.proposedChanges). Prices in paise. */
export type ProductEditChanges = {
  title: string;
  categoryId: string;
  description: string | null;
  specifications: Array<{ label: string; value: string }>;
  couponMaxDiscountPct: number;
  imageAssetIds: string[];
  videoAssetId: string | null;
  /** The main (first) variant. Kept for older edits; `variants` is the full list when set. */
  variant: { sku: string; title: string; pricePaise: number; compareAtPaise: number | null; weightGrams: number };
  /** Every variant (colour/size). `id` = an existing variant; without it a new one is created with `onHand` stock. */
  variants?: Array<{ id?: string; sku: string; title: string; pricePaise: number; compareAtPaise: number | null; weightGrams: number; onHand?: number; attributes: Record<string, string> }>;
  /** Which colour each photo shows (media asset id → colour name). */
  imageColors?: Record<string, string>;
};
import { aplusStatusEnum, mediaKindEnum, productStatusEnum, verificationStatusEnum } from "./enums";
import { users } from "./identity";
import { sellers } from "./sellers";
import { mediaAssets } from "./cms";

export const categories = pgTable(
  "categories",
  {
    id,
    parentId: uuid("parent_id"),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    // SEO: search-result title/description (auto-generated when empty) and an intro shown on the category page.
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    description: text("description"),
    // Photo for the round category row and the "Shop by category" tiles (uploaded in Admin; else a product photo is used).
    imageUrl: text("image_url"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("categories_slug_unique").on(table.slug),
    index("categories_parent_id_idx").on(table.parentId),
  ],
);

export const brands = pgTable(
  "brands",
  {
    id,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("brands_slug_unique").on(table.slug),
    index("brands_active_idx").on(table.isActive),
  ],
);

export const products = pgTable(
  "products",
  {
    id,
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    brandId: uuid("brand_id").references(() => brands.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    // Optional specification table (label/value rows), stored as plain text and rendered by LOIMART. Never raw HTML.
    specifications: jsonb("specifications").$type<Array<{ label: string; value: string }>>().notNull().default([]),
    /** Products chosen by LOIMART for "More to explore" on this product's page, in order (the rest is filled automatically). */
    relatedProductIds: uuid("related_product_ids").array().notNull().default([]),
    /** The most the seller lets LOIMART coupons take off this product (percent, paid by the seller). 0 = not in coupons. */
    couponMaxDiscountPct: integer("coupon_max_discount_pct").notNull().default(0),
    status: productStatusEnum("status").notNull().default("DRAFT"),
    // Storefront display order set by admins (1 = first). Null = not arranged yet; shown after arranged products, newest first.
    position: integer("position"),
    // SEO overrides for search results and link previews; auto-generated from the product when empty.
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    // Published review totals, kept in step with product_reviews (average = ratingTotal / reviewCount).
    reviewCount: integer("review_count").notNull().default(0),
    ratingTotal: integer("rating_total").notNull().default(0),
    // Set when the lowest price is lowered: shoppers see a "Price drop" tag for a few days.
    priceDroppedAt: timestamp("price_dropped_at", { withTimezone: true }),
    priceBeforeDropPaise: integer("price_before_drop_paise"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_seller_slug_unique").on(table.sellerId, table.slug),
    index("products_position_idx").on(table.position),
    index("products_seller_id_idx").on(table.sellerId),
    index("products_status_idx").on(table.status),
    index("products_category_id_idx").on(table.categoryId),
  ],
);

export const productAttributes = pgTable(
  "product_attributes",
  {
    id,
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    value: text("value").notNull(),
    ...timestamps,
  },
  (table) => [
    index("product_attributes_product_id_idx").on(table.productId),
    index("product_attributes_name_value_idx").on(table.name, table.value),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id,
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    title: text("title").notNull(),
    pricePaise: integer("price_paise").notNull(),
    compareAtPaise: integer("compare_at_paise"),
    weightGrams: integer("weight_grams").notNull().default(0),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_variants_sku_unique").on(table.sku),
    index("product_variants_product_id_idx").on(table.productId),
  ],
);

export const productMedia = pgTable(
  "product_media",
  {
    id,
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    mediaAssetId: uuid("media_asset_id")
      .notNull()
      .references(() => mediaAssets.id),
    kind: mediaKindEnum("kind").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    /** Colour this photo shows (matches a variant's attributes.color); null = all colours. */
    color: text("color"),
    ...timestamps,
  },
  (table) => [index("product_media_product_id_idx").on(table.productId)],
);

export const productAplusContent = pgTable(
  "product_aplus_content",
  {
    id,
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Approved content shown on the storefront. */
    blocks: jsonb("blocks").$type<Record<string, unknown>[]>().notNull().default([]),
    /** Seller's working copy; becomes `blocks` when an admin approves it. */
    draftBlocks: jsonb("draft_blocks").$type<Record<string, unknown>[]>().notNull().default([]),
    status: aplusStatusEnum("status").notNull().default("DRAFT"),
    reviewNotes: text("review_notes"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_aplus_content_product_id_unique").on(table.productId),
    index("product_aplus_content_status_idx").on(table.status),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id,
    variantId: uuid("variant_id").notNull().references(() => productVariants.id, { onDelete: "restrict" }),
    movementType: text("movement_type").notNull(),
    quantity: integer("quantity").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("inventory_movements_variant_id_idx").on(table.variantId),
    index("inventory_movements_reference_idx").on(table.referenceType, table.referenceId),
  ],
);

export const inventory = pgTable(
  "inventory",
  {
    id,
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inventory_variant_id_unique").on(table.variantId),
    index("inventory_seller_id_idx").on(table.sellerId),
  ],
);

export const qcSubmissions = pgTable(
  "qc_submissions",
  {
    id,
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => sellers.id, { onDelete: "restrict" }),
    status: verificationStatusEnum("status").notNull().default("PENDING"),
    notes: text("notes"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
    /**
     * Set for an edit to a product that is already live (or hidden): the seller's
     * new details, applied only when QC approves. Null = review of a new listing.
     */
    proposedChanges: jsonb("proposed_changes").$type<ProductEditChanges>(),
    ...timestamps,
  },
  (table) => [
    index("qc_submissions_seller_id_idx").on(table.sellerId),
    index("qc_submissions_status_idx").on(table.status),
  ],
);


export const qcIssues = pgTable(
  "qc_issues",
  {
    id,
    qcSubmissionId: uuid("qc_submission_id").notNull().references(() => qcSubmissions.id, { onDelete: "cascade" }),
    fieldName: text("field_name"),
    issueType: text("issue_type").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull().default("MEDIUM"),
    resolved: boolean("resolved").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("qc_issues_submission_id_idx").on(table.qcSubmissionId),
    index("qc_issues_resolved_idx").on(table.resolved),
  ],
);
