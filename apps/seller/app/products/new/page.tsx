import ProductBuilder from "./product-builder";

export default function NewProductPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Seller catalog</p>
      <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-5xl">Create a product</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Build the listing, add compliant media, set pricing and inventory, then send the draft through AzadiMart QC.</p>
      <ProductBuilder />
    </main>
  );
}
