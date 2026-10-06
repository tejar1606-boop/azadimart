import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { mediaKindEnum, productStatusEnum, verificationStatusEnum } from "./enums";
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
    ...timestamps,
  },
  (table) => [
    uniqueIndex("categories_slug_unique").on(table.slug),
    index("categories_parent_id_idx").on(table.parentId),
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
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    status: productStatusEnum("status").notNull().default("DRAFT"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_seller_slug_unique").on(table.sellerId, table.slug),
    index("products_seller_id_idx").on(table.sellerId),
    index("products_status_idx").on(table.status),
    index("products_category_id_idx").on(table.categoryId),
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
    blocks: jsonb("blocks").$type<Record<string, unknown>[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [uniqueIndex("product_aplus_content_product_id_unique").on(table.productId)],
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
    ...timestamps,
  },
  (table) => [
    index("qc_submissions_seller_id_idx").on(table.sellerId),
    index("qc_submissions_status_idx").on(table.status),
  ],
);
