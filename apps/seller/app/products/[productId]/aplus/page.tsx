import AplusEditor from "./aplus-editor";

export const metadata = { title: "A+ content" };

export default async function AplusPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Seller catalog</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">A+ content</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">Rich banners, images, features and comparisons shown on your product page. AzadiMart reviews A+ content before it goes live.</p>
      <AplusEditor productId={productId} />
    </main>
  );
}
