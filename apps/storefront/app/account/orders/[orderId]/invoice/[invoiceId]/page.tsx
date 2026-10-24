"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InvoiceDocument, type InvoiceView } from "@azadimart/ui";

/** The customer's invoice for an order, printable or saved as PDF. */
export default function InvoicePage() {
  const params = useParams<{ orderId: string; invoiceId: string }>();
  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/v1/orders/${params.orderId}/invoices/${params.invoiceId}`, { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) { window.location.replace("/login?next=" + encodeURIComponent(window.location.pathname)); return; }
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Unable to load the invoice.");
      setInvoice(b.invoice);
    }).catch((e) => setError(e instanceof Error ? e.message : "Unable to load the invoice."));
  }, [params.orderId, params.invoiceId]);
  return (
    <main className="min-h-[60vh] bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link href={`/account/orders/${params.orderId}`} className="invoice-noprint text-sm font-semibold text-slate-500">← Back to order</Link>
        <div className="mt-5">{error ? <p className="rounded-2xl bg-white p-8 text-center font-semibold">{error}</p> : invoice ? <InvoiceDocument invoice={invoice} /> : <div className="h-96 animate-pulse bg-white" />}</div>
      </div>
    </main>
  );
}
