import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import {
  createDatabase,
  customers,
  inventory,
  orders,
  payments,
  productAplusContent,
  productVariants,
  products,
  qcSubmissions,
  sellers,
  sellerVerifications,
} from "@azadimart/database";
import { PortalIcons, PortalPageHeader, StatCard } from "@azadimart/ui";
import { and, count, desc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const COUNTED = ["PAID", "CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;
const STATUS_TONE: Record<string, string> = {
  CONFIRMED: "bg-sky-50 text-sky-700", PACKED: "bg-sky-50 text-sky-700", SHIPPED: "bg-indigo-50 text-indigo-700",
  OUT_FOR_DELIVERY: "bg-indigo-50 text-indigo-700", DELIVERED: "bg-green-50 text-green-700", CANCELLED: "bg-slate-100 text-slate-500",
  RETURNED: "bg-amber-50 text-amber-700", PAID: "bg-green-50 text-green-700",
};

async function requireAdmin() {
  const cookie = (await headers()).get("cookie");
  const db = createDatabase();
  const principal = await getSessionPrincipal(new Request("http://azadimart.internal", { headers: cookie ? { cookie } : undefined }), db);
  if (!principal || (principal.role !== "ADMIN" && principal.role !== "SUPER_ADMIN")) redirect("/login");
  return db;
}

export default async function DashboardPage() {
  const db = await requireAdmin();
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sales = (since: Date) => db.select({ revenue: sql<number>`coalesce(sum(${orders.grandTotalPaise}), 0)`, n: count() })
    .from(orders).where(and(inArray(orders.status, [...COUNTED]), gte(orders.createdAt, since)));

  const [today, month, kyc, qc, approvals, aplus, liveProducts, activeSellers, customerCount, lowStock, recent] = await Promise.all([
    sales(startOfDay),
    sales(since30),
    db.select({ n: count() }).from(sellerVerifications).where(eq(sellerVerifications.status, "IN_REVIEW")),
    db.select({ n: count() }).from(qcSubmissions).where(eq(qcSubmissions.status, "PENDING")),
    db.select({ n: count() }).from(products).where(eq(products.status, "PENDING_ADMIN_APPROVAL")),
    db.select({ n: count() }).from(productAplusContent).where(eq(productAplusContent.status, "PENDING_REVIEW")),
    db.select({ n: count() }).from(products).where(eq(products.status, "LIVE")),
    db.select({ n: count() }).from(sellers).where(eq(sellers.status, "ACTIVE")),
    db.select({ n: count() }).from(customers),
    db.select({ n: count() }).from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(eq(products.status, "LIVE"), eq(productVariants.isActive, true), lte(sql`${inventory.onHand} - ${inventory.reserved}`, 5))),
    db.select({
      id: orders.id, orderNumber: orders.orderNumber, status: orders.status, total: orders.grandTotalPaise, createdAt: orders.createdAt,
      customer: customers.fullName,
    }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId))
      .where(notInArray(orders.status, ["CREATED"]))
      .orderBy(desc(orders.createdAt)).limit(8),
  ]);

  const recentIds = recent.map((order) => order.id);
  const paymentRows = recentIds.length ? await db.select({ orderId: payments.orderId, status: payments.status, provider: payments.provider }).from(payments).where(inArray(payments.orderId, recentIds)) : [];
  const n = (rows: Array<{ n: number }>) => Number(rows[0]?.n ?? 0);

  const queues = [
    { href: "/sellers", label: "Sellers waiting for KYC review", value: n(kyc), icon: PortalIcons.sellers },
    { href: "/qc", label: "Products in quality control", value: n(qc), icon: PortalIcons.qc },
    { href: "/products", label: "Products awaiting final approval", value: n(approvals), icon: PortalIcons.products },
    { href: "/aplus", label: "A+ content to review", value: n(aplus), icon: PortalIcons.aplus },
  ];
  const pending = queues.reduce((sum, queue) => sum + queue.value, 0);

  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader
        eyebrow={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        title="Good to see you"
        description={pending ? `${pending} item${pending === 1 ? "" : "s"} waiting for your review.` : "Everything is reviewed. Nice work."}
        actions={<><Link href="/orders" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:border-slate-900">View orders</Link><Link href="/online-store" className="rounded-full bg-chrome px-4 py-2 text-sm font-semibold text-white hover:bg-black">Edit storefront</Link></>}
      />

      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Sales today" value={money(Number(today[0]?.revenue ?? 0))} hint={`${n(today)} order${n(today) === 1 ? "" : "s"}`} icon="orders" tone="brand" href="/orders" Link={Link} />
        <StatCard label="Sales · 30 days" value={money(Number(month[0]?.revenue ?? 0))} hint={`${n(month)} orders`} icon="finance" tone="good" />
        <StatCard label="Live products" value={n(liveProducts).toLocaleString("en-IN")} hint={`${n(lowStock)} low on stock`} icon="products" tone={n(lowStock) ? "warn" : "default"} />
        <StatCard label="Sellers · customers" value={`${n(activeSellers)} · ${n(customerCount)}`} hint="Active sellers · registered customers" icon="customers" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold">Recent orders</h2>
            <Link href="/orders" className="text-sm font-semibold text-brand-600 hover:underline">All orders →</Link>
          </div>
          {recent.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-500">No orders yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-[0.08em] text-slate-400"><th className="px-5 py-3 font-medium">Order</th><th className="px-5 py-3 font-medium">Customer</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Payment</th><th className="px-5 py-3 text-right font-medium">Total</th></tr></thead>
                <tbody>
                  {recent.map((order) => {
                    const payment = paymentRows.find((row) => row.orderId === order.id);
                    return (
                      <tr key={order.id} className="border-t border-slate-100">
                        <td className="px-5 py-3"><p className="font-medium">{order.orderNumber}</p><p className="text-xs text-slate-400">{order.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p></td>
                        <td className="px-5 py-3 text-slate-700">{order.customer}</td>
                        <td className="px-5 py-3"><span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + (STATUS_TONE[order.status] ?? "bg-slate-100 text-slate-600")}>{order.status.replaceAll("_", " ").toLowerCase()}</span></td>
                        <td className="px-5 py-3 text-xs text-slate-500">{payment ? `${payment.provider} · ${payment.status.toLowerCase()}` : "—"}</td>
                        <td className="px-5 py-3 text-right font-semibold">{money(order.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="h-fit rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <h2 className="border-b border-slate-100 px-5 py-4 font-semibold">Needs your attention</h2>
          <ul className="divide-y divide-slate-100">
            {queues.map(({ href, label, value, icon: Icon }) => (
              <li key={href}>
                <Link href={href} className="flex items-center gap-3 px-5 py-4 transition hover:bg-panel">
                  <span className={"grid h-10 w-10 place-items-center rounded-xl " + (value ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400")}><Icon size={19} /></span>
                  <span className="flex-1 text-sm font-medium text-slate-700">{label}</span>
                  <span className={"min-w-8 rounded-full px-2.5 py-1 text-center text-sm font-semibold " + (value ? "bg-brand text-white" : "bg-slate-100 text-slate-500")}>{value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
