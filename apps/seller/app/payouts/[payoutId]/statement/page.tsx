"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { SettlementStatementDocument, type StatementView } from "@azadimart/ui";

/** Settlement statement for one payout, printable or saved as PDF. */
export default function StatementPage() {
  const { payoutId } = useParams<{ payoutId: string }>();
  const [statement, setStatement] = useState<StatementView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/v1/payouts/${payoutId}/statement`, { cache: "no-store" }).then(async (r) => {
      const b = await r.json();
      if (!r.ok) throw new Error(b?.error?.message ?? "Unable to load the statement.");
      setStatement(b.statement);
    }).catch((e) => setError(e instanceof Error ? e.message : "Unable to load the statement."));
  }, [payoutId]);
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <Link href="/payouts" className="invoice-noprint text-sm font-semibold text-slate-500 hover:text-slate-900">← Payments</Link>
      <div className="mt-4">{error ? <p className="rounded-2xl bg-white p-8 text-center font-semibold">{error}</p> : statement ? <SettlementStatementDocument statement={statement} feeInvoiceHref={statement.feeInvoice ? `/payouts/fee-invoices/${statement.feeInvoice.id}` : undefined} /> : <div className="h-96 animate-pulse bg-white" />}</div>
    </main>
  );
}
