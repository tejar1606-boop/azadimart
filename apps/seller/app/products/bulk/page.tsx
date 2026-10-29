import BulkUpload from "./bulk-upload";

export default function BulkUploadPage() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <a href="/products" className="text-xs font-semibold text-slate-500 hover:text-slate-900">← Your products</a>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Seller catalog</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Bulk upload</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-500">Add many products at once from an Excel or Google Sheets file, or update the stock of all your products in one go.</p>
      <BulkUpload />
    </main>
  );
}
