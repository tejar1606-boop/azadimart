import { PortalPageHeader } from "@azadimart/ui";
import PayoutsView from "./payouts-view";

export const metadata = { title: "Payments" };

export default function PayoutsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Account" title="Payments" description="Money for your delivered orders, sent automatically to your bank account." />
      <PayoutsView />
    </main>
  );
}
