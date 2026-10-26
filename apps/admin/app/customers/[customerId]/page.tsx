import Link from "next/link";
import { notFound } from "next/navigation";
import { auditLogs, customerAddresses, customerReferralRewards, customers, orders, users, walletSummary } from "@azadimart/database";
import { uuidSchema } from "@azadimart/shared";
import { PortalPageHeader, StatCard } from "@azadimart/ui";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { requireStaffPage } from "../../lib/staff-page";
import BlockCustomer from "./block-customer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customer" };

const money = (p: number) => "₹" + (p / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const when = (d: Date | string | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const KIND: Record<string, string> = { SIGNUP_BONUS: "Welcome bonus", REFERRAL_REWARD: "Referral reward", ORDER_CASHBACK: "Order cashback", ORDER_SPEND: "Used on an order", ORDER_REFUND: "Order cancelled: money back", ADJUSTMENT: "Adjustment by LOIMART" };
const STATUS_TONE: Record<string, string> = { DELIVERED: "bg-green-50 text-green-700", CANCELLED: "bg-slate-100 text-slate-500", RETURNED: "bg-amber-50 text-amber-700", SHIPPED: "bg-indigo-50 text-indigo-700", OUT_FOR_DELIVERY: "bg-indigo-50 text-indigo-700" };

/** One shopper: account, orders, addresses, wallet, referrals, and block/unblock. */
export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { db } = await requireStaffPage("orders");
  const { customerId } = await params;
  if (!uuidSchema.safeParse(customerId).success) notFound();
  const [c] = await db.select({
    id: customers.id, name: customers.fullName, referralCode: customers.referralCode, referredBy: customers.referredByCustomerId, joinedAt: customers.createdAt,
    email: users.email, phone: users.phone, phoneVerifiedAt: users.phoneVerifiedAt, status: users.status, lastLoginAt: users.lastLoginAt,
  }).from(customers).innerJoin(users, eq(users.id, customers.userId)).where(eq(customers.id, customerId)).limit(1);
  if (!c) notFound();

  const [orderRows, addresses, wallet, invitedBy, [invited], history] = await Promise.all([
    db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, total: orders.grandTotalPaise, createdAt: orders.createdAt, city: sql<string>`${orders.shippingAddressSnapshot}->>'city'`, state: sql<string>`${orders.shippingAddressSnapshot}->>'state'` })
      .from(orders).where(and(eq(orders.customerId, customerId), sql`${orders.status} not in ('CREATED', 'PAYMENT_PENDING')`)).orderBy(desc(orders.createdAt)).limit(100),
    db.select().from(customerAddresses).where(eq(customerAddresses.customerId, customerId)).orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt)),
    walletSummary(db, customerId),
    c.referredBy ? db.select({ id: customers.id, name: customers.fullName }).from(customers).where(eq(customers.id, c.referredBy)).limit(1).then((r) => r[0] ?? null) : Promise.resolve(null),
    db.select({ friends: count(), earned: sql<number>`coalesce(sum(${customerReferralRewards.amountPaise}) filter (where ${customerReferralRewards.status} = 'GRANTED'), 0)::int` }).from(customerReferralRewards).where(eq(customerReferralRewards.referrerCustomerId, customerId)),
    db.select({ action: auditLogs.action, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, by: users.email }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(and(eq(auditLogs.entityType, "customer"), eq(auditLogs.entityId, customerId))).orderBy(desc(auditLogs.createdAt)).limit(10),
  ]);
  const kept = orderRows.filter((o) => o.status !== "CANCELLED" && o.status !== "RETURNED");
  const spent = kept.reduce((s, o) => s + o.total, 0);
  const cancelled = orderRows.filter((o) => o.status === "CANCELLED").length, returned = orderRows.filter((o) => o.status === "RETURNED").length;
  const card = "rounded-2xl border border-slate-200/80 bg-white shadow-card";

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <Link href="/customers" className="text-sm font-semibold text-brand-600 hover:underline">← All customers</Link>
      <PortalPageHeader eyebrow="Customer" title={c.name} description={`Joined ${when(c.joinedAt)} · last signed in ${when(c.lastLoginAt)}`}
        actions={<BlockCustomer customerId={c.id} blocked={c.status === "DISABLED"} />} />
      {c.status === "DISABLED" ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">This account is blocked: the customer can&apos;t sign in or place orders.</p> : null}

      <section className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Orders" value={String(orderRows.length)} hint={`${cancelled} cancelled · ${returned} returned`} icon="orders" tone="brand" />
        <StatCard label="Spent" value={money(spent)} hint={kept.length ? `${money(spent / kept.length)} per order` : "No kept orders yet"} icon="finance" tone="good" />
        <StatCard label="Wallet" value={money(wallet.balancePaise)} hint={wallet.nextExpiry ? `${money(wallet.nextExpiry.amount)} expires ${when(wallet.nextExpiry.at).split(",")[0]}` : "Nothing expiring"} icon="payments" />
        <StatCard label="Friends referred" value={String(invited?.friends ?? 0)} hint={`${money(Number(invited?.earned ?? 0))} earned`} icon="customers" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className={card}>
          <h2 className="border-b border-slate-100 px-5 py-4 font-semibold">Orders</h2>
          {orderRows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No orders yet.</p> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.08em] text-slate-400"><tr><th className="px-5 py-2.5 font-medium">Order</th><th className="px-3 font-medium">Deliver to</th><th className="px-3 font-medium">Status</th><th className="px-5 text-right font-medium">Total</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{orderRows.map((o) => (
                <tr key={o.id}>
                  <td className="px-5 py-3"><Link href={`/orders?q=${encodeURIComponent(o.orderNumber)}`} className="font-medium hover:underline">{o.orderNumber}</Link><p className="text-xs text-slate-400">{when(o.createdAt)}</p></td>
                  <td className="px-3 text-xs text-slate-600">{[o.city, o.state].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-3"><span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (STATUS_TONE[o.status] ?? "bg-sky-50 text-sky-700")}>{o.status.replaceAll("_", " ").toLowerCase()}</span></td>
                  <td className="px-5 text-right font-semibold">{money(o.total)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>

        <div className="space-y-6">
          <section className={card + " p-5"}>
            <h2 className="font-semibold">Account</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-xs text-slate-500">Email</dt><dd className="break-all">{c.email}</dd></div>
              <div><dt className="text-xs text-slate-500">Mobile</dt><dd className="font-mono">{c.phone ?? "—"} <span className={"font-sans text-xs " + (c.phoneVerifiedAt ? "text-green-700" : "text-slate-400")}>{c.phone ? (c.phoneVerifiedAt ? "✓ verified by OTP" : "not verified") : ""}</span></dd></div>
              <div><dt className="text-xs text-slate-500">Referral code</dt><dd className="font-mono">{c.referralCode ?? "—"}</dd></div>
              <div><dt className="text-xs text-slate-500">Invited by</dt><dd>{invitedBy ? <Link href={`/customers/${invitedBy.id}`} className="hover:underline">{invitedBy.name}</Link> : "—"}</dd></div>
            </dl>
          </section>
          <section className={card + " p-5"}>
            <h2 className="font-semibold">Addresses</h2>
            {addresses.length === 0 ? <p className="mt-2 text-sm text-slate-500">No saved addresses.</p> : <ul className="mt-3 space-y-3 text-sm">{addresses.map((a) => (
              <li key={a.id} className="rounded-xl bg-slate-50 p-3"><p className="font-semibold">{a.label || "Address"}{a.isDefault ? <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold">Default</span> : null}</p><p className="mt-1 leading-5 text-slate-600">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} — {a.postalCode}</p></li>
            ))}</ul>}
          </section>
        </div>
      </div>

      <section className={card + " mt-6"}>
        <h2 className="border-b border-slate-100 px-5 py-4 font-semibold">Wallet history</h2>
        {wallet.entries.length === 0 ? <p className="px-5 py-8 text-center text-sm text-slate-500">No wallet activity.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">{wallet.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5"><span>{KIND[e.kind] ?? e.kind}<span className="block text-xs text-slate-400">{when(e.createdAt)}{e.note ? ` · ${e.note}` : ""}</span></span><b className={e.amountPaise < 0 ? "text-slate-700" : "text-green-700"}>{e.amountPaise < 0 ? "−" : "+"}{money(Math.abs(e.amountPaise))}</b></li>
          ))}</ul>
        )}
      </section>

      {history.length ? <section className={card + " mt-6 p-5"}>
        <h2 className="font-semibold">Account changes</h2>
        <ul className="mt-3 space-y-2 text-sm">{history.map((h, i) => (
          <li key={i}><b>{h.action === "CUSTOMER_BLOCKED" ? "Blocked" : h.action === "CUSTOMER_UNBLOCKED" ? "Unblocked" : h.action}</b> <span className="text-slate-500">· {when(h.createdAt)} · by {h.by ?? "system"}</span>{typeof h.metadata?.reason === "string" ? <span className="block text-xs text-slate-600">Reason: {h.metadata.reason}</span> : null}</li>
        ))}</ul>
      </section> : null}
    </main>
  );
}
