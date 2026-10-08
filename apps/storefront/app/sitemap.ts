import { categories, createDatabase, products } from "@azadimart/database";
import { and, desc, eq, max } from "drizzle-orm";
import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/seo";

export const revalidate = 3600;

/** sitemap.xml: home, shop, every visible category and every live product (refreshed hourly). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: MetadataRoute.Sitemap = [
    { url: SITE_URL + "/", lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: SITE_URL + "/products", lastModified: now, changeFrequency: "daily", priority: 0.8 },
  ];
  try {
    const db = createDatabase();
    const [cats, live] = await Promise.all([
      db.select({ slug: categories.slug, updatedAt: categories.updatedAt, latest: max(products.updatedAt) })
        .from(categories).leftJoin(products, and(eq(products.categoryId, categories.id), eq(products.status, "LIVE")))
        .where(eq(categories.isActive, true)).groupBy(categories.id),
      db.select({ slug: products.slug, updatedAt: products.updatedAt }).from(products)
        .where(eq(products.status, "LIVE")).orderBy(desc(products.updatedAt)).limit(45000),
    ]);
    return [
      ...base,
      ...cats.map((c) => ({ url: `${SITE_URL}/c/${c.slug}`, lastModified: c.latest && c.latest > c.updatedAt ? c.latest : c.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
      ...live.map((p) => ({ url: `${SITE_URL}/products/${p.slug}`, lastModified: p.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
    ];
  } catch {
    return base;
  }
}
