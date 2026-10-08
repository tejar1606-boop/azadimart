import { Suspense } from "react";
import { getCategoryRail } from "../lib/category-rail";
import CatalogView from "./catalog-view";

import type { Metadata } from "next";

/** Shop page is indexed; search-result variants (?q=) are not, to avoid thin duplicate pages. */
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }): Promise<Metadata> {
  const { q } = await searchParams;
  return {
    title: q ? `Results for “${q.slice(0, 60)}”` : "Shop all products online",
    description: "Browse all products from KYC-verified Indian sellers on AzadiMart: fashion, home & kitchen, beauty, electronics and more. Cash on Delivery and easy returns.",
    alternates: { canonical: "/products" },
    robots: q ? { index: false, follow: true } : undefined,
  };
}
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const rail = await getCategoryRail();
  return (
    <Suspense>
      <CatalogView rail={rail} />
    </Suspense>
  );
}
