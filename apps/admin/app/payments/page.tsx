import { customers, orders, payments, refunds } from "@azadimart/database";
import { getPaymentProviderReadiness } from "@azadimart/payments";
import { asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { AdminScreen } from "../_components/admin-screen";
import { requireStaffPage } from "../lib/staff-page";
import RefundActions from "./refund-actions";

export const dynamic = "force-dynamic";

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default async function Page() {
  const { db } = await requireStaffPage("payments");
  const providers = getPaymentProviderReadiness();
  // Refunds still owed to shoppers' original payment method (e.g. a cancelled prepaid order whose shopper chose card/UPI/bank).
  const waiting = await db.select({
    id: refunds.id, amountPaise: refunds.amountPaise, status: refunds.status, reason: refunds.reason, createdAt: refunds.createdAt,
    orderNumber: orders.orderNumber, customerId: orders.customerId, customerName: customers.fullName, provider: payments.provider,
  }).from(refunds).innerJoin(orders, eq(orders.id, refunds.orderId)).innerJoin(customers, eq(customers.id, orders.customerId)).innerJoin(payments, eq(payments.id, refunds.paymentId))
    .where(inArray(refunds.status, ["PENDING", "PROCESSING"])).orderBy(asc(refunds.createdAt)).limit(200);

  return (
    <AdminScreen
      title="Payments"
      description="Payment providers remain behind the shared @azadimart/payments abstraction."
    >
      <section className="mt-7 rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black">Refunds waiting</h2>
          <span className="text-xs font-semibold text-slate-500">{waiting.length ? `${waiting.length} to pay · ${money(waiting.reduce((s, r) => s + r.amountPaise, 0))}` : "All refunds are paid"}</span>
        </div>
        {waiting.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing waiting. Refunds to the LOIMART wallet are instant and never appear here.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">{waiting.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{money(r.amountPaise)} · <Link href={`/orders?q=${encodeURIComponent(r.orderNumber)}`} className="hover:underline">{r.orderNumber}</Link> · <Link href={`/customers/${r.customerId}`} className="hover:underline">{r.customerName}</Link></p>
                <p className="text-xs text-slate-500">{r.reason ?? "Refund"} · {r.provider} · {r.status === "PROCESSING" ? "with the gateway" : "waiting"} since {new Date(r.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
              </div>
              {r.status === "PENDING" ? <RefundActions refundId={r.id} online={r.provider !== "COD"} /> : null}
            </li>
          ))}</ul>
        )}
      </section>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => (
          <section key={provider.code} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-black">{provider.code}</h2>
              <span className={provider.isConfigured ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" : "rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"}>
                {provider.isConfigured ? "Configured" : "Credentials pending"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {provider.isConfigured
                ? "This provider is available through the application payment abstraction."
                : "The adapter is intentionally unavailable until the provider configuration is supplied."}
            </p>
          </section>
        ))}
      </div>
    </AdminScreen>
  );
}
