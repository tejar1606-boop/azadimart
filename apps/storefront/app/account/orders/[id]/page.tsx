import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionPrincipal } from "@azadimart/auth";
import { createDatabase, orderItems, orders, payments } from "@azadimart/database";
import { and, asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const states = ["CREATED", "PAYMENT_PENDING", "PAID", "CONFIRMED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"] as const;

export default async function OrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = createDatabase();
  const principal = await getSessionPrincipal(new Request("https://azadimart.local/account/orders/" + id), db);
  if (!principal?.customerId) notFound();

  const rows = await db.select({
    id: orders.id, orderNumber: orders.orderNumber, status: orders.status,
    subtotalPaise: orders.subtotalPaise, discountPaise: orders.discountPaise,
    shippingPaise: orders.shippingPaise, grandTotalPaise: orders.grandTotalPaise,
    couponCode: orders.couponCode, createdAt: orders.createdAt,
    shippingAddressSnapshot: orders.shippingAddressSnapshot,
    paymentStatus: payments.status, paymentProvider: payments.provider,
  }).from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(and(eq(orders.id, id), eq(orders.customerId, principal.customerId)))
    .limit(1);

  const order = rows[0];
  if (!order) notFound();

  const items = await db.select({
    title: orderItems.title, sku: orderItems.sku, quantity: orderItems.quantity,
    unitPricePaise: orderItems.unitPricePaise,
  }).from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.createdAt));

  const currentIndex = states.indexOf(order.status as typeof states[number]);
  const terminal = order.status === "CANCELLED" || order.status === "RETURNED";
  const address = order.shippingAddressSnapshot;

  return (
    <main className="min-h-screen bg-[#f8f7f3] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/account" className="text-sm font-semibold text-slate-500 hover:text-slate-950">← My orders</Link>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600">Order details</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-5xl">{order.orderNumber}</h1>
            <p className="mt-2 text-sm text-slate-500">Placed {new Date(order.createdAt).toLocaleString("en-IN")}</p>
          </div>
          <span className="w-fit rounded-full bg-slate-950 px-4 py-2 text-xs font-bold text-white">{order.status.replaceAll("_", " ")}</span>
        </div>

        <section className="mt-7 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Order progress</p><h2 className="mt-1 text-lg font-black">Delivery status</h2></div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{order.paymentStatus ?? "PENDING"}</span>
          </div>
          {terminal ? (
            <div className="mt-6 rounded-2xl bg-slate-50 p-5"><p className="font-black">{order.status === "CANCELLED" ? "This order was cancelled." : "This order was returned."}</p><p className="mt-1 text-sm text-slate-500">The current order state is shown from AzadiMart's order system.</p></div>
          ) : (
            <div className="mt-7 grid gap-5 sm:grid-cols-4">
              {states.map((state, index) => {
                const active = currentIndex >= 0 && index <= currentIndex;
                return <div key={state} className="relative"><div className={"grid h-9 w-9 place-items-center rounded-full text-xs font-black " + (active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-400")}>{index + 1}</div><p className={"mt-2 text-xs font-bold " + (active ? "text-slate-950" : "text-slate-400")}>{state.replaceAll("_", " ")}</p>{index < states.length - 1 ? <div className={"absolute left-9 top-4 hidden h-px w-[calc(100%-1rem)] sm:block " + (active && currentIndex > index ? "bg-slate-950" : "bg-slate-200")} /> : null}</div>;
              })}
            </div>
          )}
        </section>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_360px]">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-lg font-black">Items in this order</h2>
            <div className="mt-4 divide-y divide-slate-100">
              {items.map((item) => <div key={item.sku + item.title} className="flex items-center justify-between gap-5 py-4"><div className="min-w-0"><p className="font-bold">{item.title}</p><p className="mt-1 text-xs text-slate-400">SKU {item.sku} · Qty {item.quantity}</p></div><p className="shrink-0 font-black">{money(item.unitPricePaise * item.quantity)}</p></div>)}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-lg font-black">Payment summary</h2>
              <div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{money(order.subtotalPaise)}</span></div><div className="flex justify-between"><span className="text-slate-500">Discount</span><span>−{money(order.discountPaise)}</span></div><div className="flex justify-between"><span className="text-slate-500">Shipping</span><span>{money(order.shippingPaise)}</span></div><div className="flex justify-between border-t border-slate-100 pt-4 text-base font-black"><span>Total</span><span>{money(order.grandTotalPaise)}</span></div></div>
              <p className="mt-4 text-xs text-slate-400">Payment: {order.paymentProvider ?? "Not available"} · {order.paymentStatus ?? "PENDING"}</p>
              {order.couponCode ? <p className="mt-2 text-xs font-semibold text-emerald-700">Coupon applied: {order.couponCode}</p> : null}
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <h2 className="text-lg font-black">Delivery address</h2>
              <div className="mt-4 text-sm leading-6 text-slate-500">{address.name ? <p className="font-bold text-slate-900">{address.name}</p> : null}<p>{address.line1}</p>{address.line2 ? <p>{address.line2}</p> : null}<p>{address.city}, {address.state} — {address.postalCode}</p><p>{address.country}</p></div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
