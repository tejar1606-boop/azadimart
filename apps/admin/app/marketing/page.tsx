import Link from "next/link";
import { AdminScreen } from "../_components/admin-screen";

export default function Page() {
  return (
    <main className="px-4 py-5 md:px-8 md:py-10">
      <AdminScreen title="Marketing" description="Control campaigns, homepage merchandising, promotional offers and customer acquisition." />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link href="/marketing/coupons" className="rounded-2xl border bg-white p-5 shadow-sm hover:border-slate-400">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Promotions</p>
          <h2 className="mt-1 text-lg font-bold">Coupons & discounts</h2>
          <p className="mt-2 text-sm text-slate-500">Create percentage, fixed-value and free-shipping coupon campaigns.</p>
        </Link>
        <Link href="/online-store" className="rounded-2xl border bg-white p-5 shadow-sm hover:border-slate-400">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Merchandising</p>
          <h2 className="mt-1 text-lg font-bold">Online Store</h2>
          <p className="mt-2 text-sm text-slate-500">Edit homepage sections, reorder content and publish a storefront draft.</p>
        </Link>
      </div>
    </main>
  );
}