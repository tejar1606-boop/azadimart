import { Suspense } from "react";
import { getCategoryRail } from "../lib/category-rail";
import CatalogView from "./catalog-view";

export const metadata = { title: "Shop all products" };
export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const rail = await getCategoryRail();
  return (
    <Suspense>
      <CatalogView rail={rail} />
    </Suspense>
  );
}
