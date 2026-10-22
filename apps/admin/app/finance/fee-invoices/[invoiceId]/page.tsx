import Link from "next/link";
import { notFound } from "next/navigation";
import { FeeInvoiceDocument } from "@azadimart/ui";
import { feeInvoices } from "@azadimart/database";
import { eq } from "drizzle-orm";
import { requireStaffPage } from "../../../lib/staff-page";

export const metadata = { title: "Fee invoice" };

export default async function AdminFeeInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { db } = await requireStaffPage("payments");
  const { invoiceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) notFound();
  const row = (await db.select().from(feeInvoices).where(eq(feeInvoices.id, invoiceId)).limit(1))[0];
  if (!row) notFound();
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/finance/invoices?tab=fees" className="invoice-noprint text-sm font-semibold text-slate-500 hover:text-slate-900">← Invoices</Link>
      <div className="mt-4"><FeeInvoiceDocument invoice={{ kind: row.kind, number: row.number, issuedAt: row.issuedAt.toISOString(), isTest: row.isTest, details: row.details }} /></div>
    </main>
  );
}
