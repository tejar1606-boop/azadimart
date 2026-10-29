import { PortalPageHeader } from "@azadimart/ui";
import { Suspense } from "react";
import InventoryView from "./inventory-view";

export const metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Catalogue" title="Inventory" description="Stock available to sell for every SKU. When something runs out, update its stock here." />
      <Suspense fallback={<p className="mt-6 text-sm text-slate-500">Loading stock…</p>}><InventoryView /></Suspense>
    </main>
  );
}
