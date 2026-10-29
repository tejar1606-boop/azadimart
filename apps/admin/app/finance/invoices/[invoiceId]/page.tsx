import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@azadimart/ui";
import { invoices } from "@azadimart/database";
import { eq } from "drizzle-orm";
import { requireStaffPage } from "../../../lib/staff-page";

export const metadata = { title: "Invoice" };

export default async function AdminInvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { db } = await requireStaffPage("payments");
  const { invoiceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) notFound();
  const row = (await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1))[0];
  if (!row) notFound();
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/finance/invoices" className="invoice-noprint text-sm font-semibold text-slate-500 hover:text-slate-900">← All invoices</Link>
      <div className="mt-4"><InvoiceDocument invoice={{ kind: row.kind, number: row.number, issuedAt: row.issuedAt.toISOString(), isTest: row.isTest, details: row.details }} /></div>
    </main>
  );
}
