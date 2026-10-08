import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import {
  createDatabase,
  inventory,
  orderItems,
  orders,
  productVariants,
  products,
  sellerSettings,
  sellers,
  shipments,
} from "@azadimart/database";
import { sellerShippingSettingsSchema } from "@azadimart/shared";
import { and, asc, count, desc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const LOW_STOCK_THRESHOLD = 5;
const SALE_STATUSES = ["PAID", "CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

async function requireActiveSeller() {
  const cookie = (await headers()).get("cookie");
  const db = createDatabase();
  const principal = await getSessionPrincipal(
    new Request("http://azadimart.internal", { headers: cookie ? { cookie } : undefined }),
    db,
  );
  if (!principal || principal.role !== "SELLER" || !principal.sellerId) redirect("/login");

  const seller = (await db
    .select({ id: sellers.id, storeName: sellers.storeName, status: sellers.status })
    .from(sellers)
    .where(eq(sellers.id, principal.sellerId))
    .limit(1))[0];
  if (!seller || seller.status !== "ACTIVE") redirect("/kyc");
  return { db, seller };
}

export default async function DashboardPage() {
  const { db, seller } = await requireActiveSeller();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [productCounts, openOrderRows, sales, lowStock, recentRows, settingsRow] = await Promise.all([
    db.select({ status: products.status, total: count() })
      .from(products).where(eq(products.sellerId, seller.id)).groupBy(products.status),

    db.selectDistinct({ id: orders.id, orderNumber: orders.orderNumber, createdAt: orders.createdAt })
      .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.sellerId, seller.id), inArray(orders.status, ["CONFIRMED", "PACKED"]))),

    db.select({
      revenuePaise: sql<number>`coalesce(sum(${orderItems.unitPricePaise} * ${orderItems.quantity}), 0)`,
      units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)`,
      orderCount: sql<number>`count(distinct ${orders.id})`,
    }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orderItems.sellerId, seller.id), inArray(orders.status, [...SALE_STATUSES]), gte(orders.createdAt, since))),

    db.select({
      productId: products.id,
      title: products.title,
      variantTitle: productVariants.title,
      sku: productVariants.sku,
      available: sql<number>`${inventory.onHand} - ${inventory.reserved}`,
    }).from(inventory)
      .innerJoin(productVariants, eq(productVariants.id, inventory.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(and(
        eq(inventory.sellerId, seller.id),
        eq(productVariants.isActive, true),
        notInArray(products.status, ["ARCHIVED"]),
        lte(sql`${inventory.onHand} - ${inventory.reserved}`, LOW_STOCK_THRESHOLD),
      ))
      .orderBy(asc(sql`${inventory.onHand} - ${inventory.reserved}`))
      .limit(5),

    db.select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      createdAt: orders.createdAt,
      linePaise: sql<number>`${orderItems.unitPricePaise} * ${orderItems.quantity}`,
      quantity: orderItems.quantity,
    }).from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orderItems.sellerId, seller.id))
      .orderBy(desc(orders.createdAt))
      .limit(40),

    db.select({ shippingSettings: sellerSettings.shippingSettings })
      .from(sellerSettings).where(eq(sellerSettings.sellerId, seller.id)).limit(1),
  ]);

  // Open orders still waiting for this seller's shipment (none, or failed/cancelled).
  const openOrderIds = openOrderRows.map((row) => row.id);
  const shippedOrderIds = new Set(openOrderIds.length
    ? (await db.select({ orderId: shipments.orderId }).from(shipments).where(and(
      eq(shipments.sellerId, seller.id),
      inArray(shipments.orderId, openOrderIds),
      notInArray(shipments.status, ["FAILED", "CANCELLED"]),
    ))).map((row) => row.orderId)
    : []);
  const toShip = openOrderRows.filter((row) => !shippedOrderIds.has(row.id));

  const byStatus = Object.fromEntries(productCounts.map((row) => [row.status, Number(row.total)]));
  const liveCount = byStatus.LIVE ?? 0;
  const inReview = (byStatus.PENDING_QC ?? 0) + (byStatus.PENDING_ADMIN_APPROVAL ?? 0);
  const needsWork = (byStatus.DRAFT ?? 0) + (byStatus.QC_REJECTED ?? 0);
  const totalProducts = productCounts.reduce((sum, row) => sum + Number(row.total), 0);
  const shippingConfigured = sellerShippingSettingsSchema.safeParse(settingsRow[0]?.shippingSettings).success;
  const sale = sales[0] ?? { revenuePaise: 0, units: 0, orderCount: 0 };

  const recent = new Map<string, { id: string; orderNumber: string; status: string; createdAt: Date; totalPaise: number; units: number }>();
  for (const row of recentRows) {
    const current = recent.get(row.id) ?? { ...row, totalPaise: 0, units: 0 };
    current.totalPaise += Number(row.linePaise);
    current.units += row.quantity;
    recent.set(row.id, current);
  }
  const recentOrders = [...recent.values()].slice(0, 5);

  const tasks = [
    !shippingConfigured && { href: "/shipping", label: "Add your pickup address and courier preference", detail: "Required before you can ship orders." },
    toShip.length > 0 && { href: "/orders", label: `${toShip.length} order${toShip.length === 1 ? "" : "s"} waiting for shipment`, detail: "Create shipments so customers get tracking." },
    totalProducts === 0 && { href: "/products/new", label: "Create your first product", detail: "Add photos, price, stock and package weight, then submit for QC." },
    (byStatus.QC_REJECTED ?? 0) > 0 && { href: "/products", label: `${byStatus.QC_REJECTED} product${byStatus.QC_REJECTED === 1 ? " needs" : "s need"} changes after QC`, detail: "Review the QC feedback and resubmit." },
    (byStatus.DRAFT ?? 0) > 0 && { href: "/products", label: `${byStatus.DRAFT} draft product${byStatus.DRAFT === 1 ? "" : "s"} not submitted`, detail: "Submit drafts for QC to go live." },
  ].filter(Boolean) as Array<{ href: string; label: string; detail: string }>;

  const stats = [
    { label: "Sales · last 30 days", value: money(Number(sale.revenuePaise)), note: `${Number(sale.orderCount)} orders · ${Number(sale.units)} units` },
    { label: "To ship", value: String(toShip.length), note: "Confirmed orders without a shipment", href: "/orders" },
    { label: "Live products", value: String(liveCount), note: inReview ? `${inReview} in review` : "Visible to customers", href: "/products" },
    { label: "Needs attention", value: String(needsWork + lowStock.length), note: `${needsWork} drafts/rejected · ${lowStock.length} low stock` },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Seller dashboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">{seller.storeName}</h1>
          <p className="mt-2 text-sm text-slate-500">Your store at a glance. Figures cover only your own products and order lines.</p>
        </div>
        <Link href="/products/new" className="rounded-full bg-slate-950 px-5 py-3 text-center text-sm font-black text-white">Create product</Link>
      </div>

      <section className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const body = (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{stat.label}</p>
              <p className="mt-2 text-2xl font-black tracking-[-0.03em] sm:text-3xl">{stat.value}</p>
              <p className="mt-1 text-xs text-slate-500">{stat.note}</p>
            </>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-400 sm:p-5">{body}</Link>
          ) : (
            <div key={stat.label} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">{body}</div>
          );
        })}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black">Recent orders</h2>
            <Link href="/orders" className="text-xs font-bold text-slate-500 hover:text-slate-950">All orders →</Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No orders yet. Orders containing your products will appear here.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="text-sm font-bold">{order.orderNumber}</p>
                    <p className="text-xs text-slate-400">{order.createdAt.toLocaleString("en-IN")} · {order.units} unit{order.units === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold">{order.status.replaceAll("_", " ")}</span>
                    <span className="text-sm font-black">{money(order.totalPaise)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-lg font-black">To do</h2>
            {tasks.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">You&apos;re all caught up.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {tasks.map((task) => (
                  <li key={task.label}>
                    <Link href={task.href} className="block rounded-2xl bg-amber-50 p-3 hover:bg-amber-100">
                      <p className="text-sm font-bold text-amber-900">{task.label}</p>
                      <p className="mt-0.5 text-xs text-amber-800/80">{task.detail}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-lg font-black">Low stock</h2>
            {lowStock.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No variants at or below {LOW_STOCK_THRESHOLD} units.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {lowStock.map((item) => (
                  <li key={item.sku} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <p className="text-xs text-slate-400">{item.variantTitle} · SKU {item.sku}</p>
                    </div>
                    <span className={"shrink-0 rounded-full px-2.5 py-1 text-xs font-bold " + (Number(item.available) <= 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
                      {Number(item.available) <= 0 ? "Out of stock" : `${item.available} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
