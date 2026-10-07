import ProductList from "./product-list";

export default function ProductsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Seller catalog</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Your products</h1>
          <p className="mt-2 text-sm text-slate-500">Manage drafts, QC submissions and live catalog listings from one place.</p>
        </div>
        <a href="/products/new" className="rounded-full bg-slate-950 px-5 py-3 text-center text-sm font-black text-white">Create product</a>
      </div>
      <ProductList />
    </main>
  );
}
