import { PortalPageHeader } from "@azadimart/ui";
import CustomersList from "./customers-list";

export const metadata = { title: "Customers" };

export default function Page() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Sales" title="Customers" description="Every shopper account: search by name, email or mobile, see their orders, addresses and wallet, and block an account if needed." />
      <CustomersList />
    </main>
  );
}
