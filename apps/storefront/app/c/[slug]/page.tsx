import { categories, createDatabase } from "@azadimart/database";
import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { getCategoryRail } from "../../lib/category-rail";
import CatalogView, { type FixedCategory } from "../../products/catalog-view";

export const dynamic = "force-dynamic";

/** Active category by its web address, with its parent and visible sub-categories. */
const findCategory = cache(async (slug: string): Promise<FixedCategory | null> => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const db = createDatabase();
  const row = (await db.select().from(categories).where(and(eq(categories.slug, slug), eq(categories.isActive, true))).limit(1))[0];
  if (!row) return null;
  const [parent, children] = await Promise.all([
    row.parentId ? db.select({ name: categories.name, slug: categories.slug, isActive: categories.isActive }).from(categories).where(eq(categories.id, row.parentId)).limit(1).then((r) => r[0]) : undefined,
    db.select({ name: categories.name, slug: categories.slug }).from(categories)
      .where(and(eq(categories.parentId, row.id), eq(categories.isActive, true))).orderBy(asc(categories.sortOrder), asc(categories.name)),
  ]);
  return { id: row.id, name: row.name, slug: row.slug, parent: parent?.isActive ? { name: parent.name, slug: parent.slug } : null, children };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const category = await findCategory((await params).slug);
  return category
    ? { title: category.name, description: `Shop ${category.name} from verified Indian sellers on AzadiMart. Cash on Delivery available.` }
    : { title: "Category not found" };
}

/** A category's own page, e.g. /c/electronics-accessories. Link menus and banners here. */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const [category, rail] = await Promise.all([findCategory((await params).slug), getCategoryRail()]);
  if (!category) notFound();
  return (
    <Suspense>
      <CatalogView category={category} rail={rail} />
    </Suspense>
  );
}
