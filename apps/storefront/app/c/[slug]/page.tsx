import { categories, createDatabase } from "@azadimart/database";
import { and, asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { getCategoryRail } from "../../lib/category-rail";
import { SITE_NAME, absoluteUrl, clip, jsonLd } from "../../lib/seo";
import CatalogView, { type FixedCategory } from "../../products/catalog-view";
import PageBanner from "../../components/page-banner";

type CategorySeo = FixedCategory & { metaTitle: string | null; metaDescription: string | null };

export const dynamic = "force-dynamic";

/** Active category by its web address, with its parent and visible sub-categories. */
const findCategory = cache(async (slug: string): Promise<CategorySeo | null> => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const db = createDatabase();
  const row = (await db.select().from(categories).where(and(eq(categories.slug, slug), eq(categories.isActive, true))).limit(1))[0];
  if (!row) return null;
  const [parent, children] = await Promise.all([
    row.parentId ? db.select({ name: categories.name, slug: categories.slug, isActive: categories.isActive }).from(categories).where(eq(categories.id, row.parentId)).limit(1).then((r) => r[0]) : undefined,
    db.select({ name: categories.name, slug: categories.slug }).from(categories)
      .where(and(eq(categories.parentId, row.id), eq(categories.isActive, true))).orderBy(asc(categories.sortOrder), asc(categories.name)),
  ]);
  return { id: row.id, name: row.name, slug: row.slug, intro: row.description, metaTitle: row.metaTitle, metaDescription: row.metaDescription, parent: parent?.isActive ? { name: parent.name, slug: parent.slug } : null, children };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const category = await findCategory((await params).slug);
  if (!category) return { title: "Category not found", robots: { index: false } };
  const title = category.metaTitle?.trim() || `${category.name} – Shop online in India`;
  const description = clip(category.metaDescription?.trim() || category.intro || `Shop ${category.name} online from KYC-verified Indian sellers on AzadiMart. Quality-checked products, best prices, Cash on Delivery and easy returns.`);
  return {
    title,
    description,
    alternates: { canonical: "/c/" + category.slug },
    openGraph: { title, description, url: "/c/" + category.slug, siteName: SITE_NAME, locale: "en_IN", type: "website" },
  };
}

/** A category's own page, e.g. /c/electronics-accessories. Link menus and banners here. */
export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const [category, rail] = await Promise.all([findCategory((await params).slug), getCategoryRail()]);
  if (!category) notFound();
  return (
    <Suspense>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
          ...(category.parent ? [{ "@type": "ListItem", position: 2, name: category.parent.name, item: absoluteUrl("/c/" + category.parent.slug) }] : []),
          { "@type": "ListItem", position: category.parent ? 3 : 2, name: category.name, item: absoluteUrl("/c/" + category.slug) },
        ],
      })} />
      <PageBanner categoryId={category.id} />
      <CatalogView category={category} rail={rail} />
    </Suspense>
  );
}
