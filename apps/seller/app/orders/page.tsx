import Link from "next/link";
import { PortalPageHeader } from "@azadimart/ui";
import OrderList from "./order-list";

export const metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader
        eyebrow="Manage business"
        title="Orders"
        description="Orders for your products, grouped by what to do next. Ship new orders quickly to keep customers happy."
        actions={<Link href="/shipping" className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-slate-300 hover:ring-slate-900">Shipping &amp; pickup</Link>}
      />
      <OrderList />
    </main>
  );
}
