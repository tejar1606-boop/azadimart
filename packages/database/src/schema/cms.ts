import { boolean, index, integer, jsonb, pgTable, sql, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { mediaKindEnum, pageStatusEnum, themeStatusEnum } from "./enums";
import { users } from "./identity";

export const mediaAssets = pgTable(
  "media_assets",
  {
    id,
    kind: mediaKindEnum("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    checksum: text("checksum"),
    altText: text("alt_text"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [uniqueIndex("media_assets_storage_key_unique").on(table.storageKey)],
);

export const themes = pgTable(
  "themes",
  {
    id,
    name: text("name").notNull(),
    status: themeStatusEnum("status").notNull().default("DRAFT"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("themes_published_unique").on(table.status).where(sql`${table.status} = 'PUBLISHED'`),
  ],
);

export const themeRevisions = pgTable(
  "theme_revisions",
  {
    id,
    themeId: uuid("theme_id").notNull().references(() => themes.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    message: text("message"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [index("theme_revisions_theme_id_idx").on(table.themeId)],
);

export const pages = pgTable(
  "pages",
  {
    id,
    themeId: uuid("theme_id").notNull().references(() => themes.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    status: pageStatusEnum("status").notNull().default("DRAFT"),
    ...timestamps,
  },
  (table) => [uniqueIndex("pages_theme_slug_unique").on(table.themeId, table.slug)],
);

export const pageSections = pgTable(
  "page_sections",
  {
    id,
    pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    position: integer("position").notNull(),
    isVisible: boolean("is_visible").notNull().default(true),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [index("page_sections_page_id_idx").on(table.pageId)],
);

export const navigation = pgTable(
  "navigation",
  {
    id,
    themeId: uuid("theme_id").notNull().references(() => themes.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    items: jsonb("items").$type<Record<string, unknown>[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [uniqueIndex("navigation_theme_handle_unique").on(table.themeId, table.handle)],
);

export const navigationItems = pgTable(
  "navigation_items",
  {
    id,
    navigationId: uuid("navigation_id").notNull().references(() => navigation.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    href: text("href"),
    position: integer("position").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("navigation_items_navigation_id_idx").on(table.navigationId)],
);

export const banners = pgTable(
  "banners",
  {
    id,
    themeId: uuid("theme_id").references(() => themes.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    mediaAssetId: uuid("media_asset_id").references(() => mediaAssets.id),
    href: text("href"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("banners_theme_id_idx").on(table.themeId)],
);