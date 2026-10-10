import { categories, createDatabase } from "@azadimart/database";
import { asc, eq, sql } from "drizzle-orm";

/** A category in the shop pages' left column, with a photo from one of its live products. */
export type RailCategory = { id: string; name: string; slug: string; parentId: string | null; imageKey: string | null; count: number };

/**
 * Active categories in admin order, each with a cover photo (the first live
 * product in store order) and its live product count. A main category counts,
 * and borrows a photo from, its sub-categories. Never throws: the shop still
 * renders without the column.
 */
export async function getCategoryRail(): Promise<RailCategory[]> {
  try {
    const db = createDatabase();
    const [rows, covers, counts] = await Promise.all([
      db.select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId })
        .from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name)),
      db.execute<{ category_id: string; storage_key: string }>(sql`
        select distinct on (p.category_id) p.category_id, ma.storage_key
        from products p
        join product_media pm on pm.product_id = p.id and pm.kind = 'IMAGE'
        join media_assets ma on ma.id = pm.media_asset_id
        where p.status = 'LIVE'
        order by p.category_id, p.position asc nulls last, p.created_at desc, pm.sort_order asc`),
      db.execute<{ category_id: string; n: number }>(sql`select category_id, count(*)::int as n from products where status = 'LIVE' group by category_id`),
    ]);
    const cover = new Map(covers.rows.map((r) => [r.category_id, r.storage_key]));
    const count = new Map(counts.rows.map((r) => [r.category_id, Number(r.n)]));
    const active = new Set(rows.map((r) => r.id));
    // Sub-categories under a hidden parent are hidden too.
    const visible = rows.filter((r) => !r.parentId || active.has(r.parentId));
    return visible.map((r) => {
      const children = visible.filter((c) => c.parentId === r.id);
      return {
        ...r,
        imageKey: cover.get(r.id) ?? children.map((c) => cover.get(c.id)).find(Boolean) ?? null,
        count: (count.get(r.id) ?? 0) + children.reduce((sum, c) => sum + (count.get(c.id) ?? 0), 0),
      };
    });
  } catch {
    return [];
  }
}

