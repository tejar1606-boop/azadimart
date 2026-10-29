import { PortalPageHeader } from "@azadimart/ui";
import ReturnsList from "./returns-list";

export const metadata = { title: "Returns" };

export default function Page() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Sales" title="Returns" description="Every return across sellers. Sellers approve and receive their own returns; step in here when one is stuck or disputed, and refund the customer once the item is back." />
      <ReturnsList />
    </main>
  );
}
