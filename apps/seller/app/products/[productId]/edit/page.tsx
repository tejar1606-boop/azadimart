import Link from "next/link";
import ProductBuilder from "../../new/product-builder";

export default async function EditProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/products" className="text-sm font-semibold text-slate-500 hover:text-slate-900">← Products</Link>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Seller catalog</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Edit product</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Update details, photos, price and stock. Changes to a live product are checked by LOIMART QC before they appear on the store.</p>
      <ProductBuilder productId={productId} />
    </main>
  );
}
