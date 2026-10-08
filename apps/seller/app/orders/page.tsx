import OrderList from "./order-list";

export default function OrdersPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Seller operations</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Orders.</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">See customer orders containing your products and prepare them for fulfillment.</p><a href="/shipping" className="mt-4 inline-flex rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700">Shipping settings</a>
      <OrderList />
    </main>
  );
}
