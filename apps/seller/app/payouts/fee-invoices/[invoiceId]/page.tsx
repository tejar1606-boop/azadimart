"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FeeInvoiceDocument, type FeeInvoiceView } from "@azadimart/ui";

/** LOIMART's tax invoice to the seller for its fees in one settlement. */
export default function FeeInvoicePage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<FeeInvoiceView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/v1/fee-invoices/${invoiceId}`, { cache: "no-store" }).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Unable to load the invoice.");
      setInvoice(b.invoice);
    }).catch((e) => setError(e instanceof Error ? e.message : "Unable to load the invoice."));
  }, [invoiceId]);
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <Link href="/payouts" className="invoice-noprint text-sm font-semibold text-slate-500 hover:text-slate-900">← Payments</Link>
      <div className="mt-4">{error ? <p className="rounded-2xl bg-white p-8 text-center font-semibold">{error}</p> : invoice ? <FeeInvoiceDocument invoice={invoice} /> : <div className="h-96 animate-pulse bg-white" />}</div>
    </main>
  );
}
