import { Suspense } from "react";
import CatalogView from "./catalog-view";

export const metadata = { title: "Shop all products" };

export default function ProductsPage() {
  return (
    <Suspense>
      <CatalogView />
    </Suspense>
  );
}
