import Link from "next/link";
import { notFound } from "next/navigation";
import { SettlementStatementDocument } from "@azadimart/ui";
import { loadSettlementStatement } from "@azadimart/database";
import { requireStaffPage } from "../../../lib/staff-page";

export const metadata = { title: "Settlement statement" };

export default async function AdminStatementPage({ params }: { params: Promise<{ payoutId: string }> }) {
  const { db } = await requireStaffPage("payments");
  const { payoutId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(payoutId)) notFound();
  const statement = await loadSettlementStatement(db, payoutId);
  if (!statement) notFound();
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/finance" className="invoice-noprint text-sm font-semibold text-slate-500 hover:text-slate-900">← Seller payouts</Link>
      <div className="mt-4"><SettlementStatementDocument statement={statement} feeInvoiceHref={statement.feeInvoice ? `/finance/fee-invoices/${statement.feeInvoice.id}` : undefined} /></div>
    </main>
  );
}
