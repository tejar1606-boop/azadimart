import { ComingSoon, PortalPageHeader } from "@azadimart/ui";

export const metadata = { title: "Payouts" };

export default function PayoutsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Account" title="Payouts" description="Settlements for delivered orders, paid to your verified bank account." />
      <div className="mt-6">
        <ComingSoon icon="payouts" title="Payouts are on the way" description="Once online payments are connected, you'll see settlement cycles, fees and transfers here." points={["Settlement schedule", "Commission & fees", "Bank transfers", "Downloadable statements"]} />
      </div>
    </main>
  );
}
