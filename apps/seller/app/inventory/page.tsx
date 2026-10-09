import { PortalPageHeader } from "@azadimart/ui";
import InventoryView from "./inventory-view";

export const metadata = { title: "Inventory" };

export default function InventoryPage() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Catalogue" title="Inventory" description="Stock available to sell across your products." />
      <InventoryView />
    </main>
  );
}
