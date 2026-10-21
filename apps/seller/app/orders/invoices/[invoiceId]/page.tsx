"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InvoiceDocument, type InvoiceView } from "@azadimart/ui";

/** An invoice LOIMART issued in the seller's name (or a credit note), printable or saved as PDF. */
export default function SellerInvoicePage() {
  const params = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/v1/invoices/${params.invoiceId}`, { cache: "no-store" }).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Unable to load the invoice.");
      setInvoice(b.invoice);
    }).catch((e) => setError(e instanceof Error ? e.message : "Unable to load the invoice."));
  }, [params.invoiceId]);
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <Link href="/orders" className="invoice-noprint text-sm font-semibold text-slate-500 hover:text-slate-900">← Orders</Link>
      <div className="mt-4">{error ? <p className="rounded-2xl bg-white p-8 text-center font-semibold">{error}</p> : invoice ? <InvoiceDocument invoice={invoice} /> : <div className="h-96 animate-pulse bg-white" />}</div>
    </main>
  );
}
