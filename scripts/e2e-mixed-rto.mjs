// End-to-end test for one order with parcels from two sellers where the buyer
// takes one and refuses the other at the door (RTO). Each parcel is settled
// on its own: the delivered seller is paid from their own delivery, the
// refused parcel's seller isn't paid for it and their stock is free to sell
// again; the order counts as delivered (Cash on Delivery collected) once the
// refused parcel is back. Requires the demo seed + catalogue seed and all
// three apps against a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:mixed-rto
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'checkout:%' or key like 'login:%'`;
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
const seller = client(SE), admin = client(AD), shop = client(SF);
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });

const [me] = await sql`select s.id from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const stocked = (own) => sql`select v.id variant_id, p.seller_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  join sellers s on s.id = p.seller_id left join seller_settings ss on ss.seller_id = s.id
  where (p.seller_id = ${me.id}) = ${own} and coalesce(nullif(ss.shipping_settings->'pickup'->>'state', ''), s.business_state, '') <> '' and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 3 order by p.created_at desc limit 1`;
const [mine] = await stocked(true);
const [theirs] = await stocked(false);
if (!mine || !theirs) throw new Error("Need stocked live products from the demo seller and one other seller.");
const stock = async (variantId) => (await sql`select on_hand, reserved from inventory where variant_id = ${variantId}`)[0];
const before = { mine: await stock(mine.variant_id), theirs: await stock(theirs.variant_id) };

const created = [];
async function tidy() {
  for (const id of created) {
    const ships = await sql`select id from shipments where order_id = ${id}`;
    await sql`delete from shipment_events where shipment_id = any(${ships.map((s) => s.id)}::uuid[])`;
    await sql`delete from audit_logs where entity_id = any(${[id, ...ships.map((s) => s.id)]}::text[])`;
    await sql`delete from invoices where order_id = ${id}`;
    await sql`delete from inventory_movements where reference_id = ${id}`;
    await sql`delete from shipments where order_id = ${id}`;
    await sql`delete from payments where order_id = ${id}`;
    await sql`delete from order_items where order_id = ${id}`;
    await sql`delete from orders where id = ${id}`;
  }
  // Delivered parcels took their units off the shelf; put the shelf back as it was.
  for (const [k, v] of Object.entries({ mine, theirs })) await sql`update inventory set on_hand = ${before[k].on_hand}, reserved = ${before[k].reserved} where variant_id = ${v.variant_id}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "21 Residency Road", city: "Bengaluru", state: "Karnataka", postalCode: "560025" } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
/** One COD order with a unit from each seller, both parcels out for delivery. */
async function twoSellerOrder() {
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await shop("/api/v1/cart", { method: "POST", body: { variantId: mine.variant_id, quantity: 1 } });
  await shop("/api/v1/cart", { method: "POST", body: { variantId: theirs.variant_id, quantity: 1 } });
  const o = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
  if (!o.json?.orderId) throw new Error("Checkout failed: " + o.status + " " + JSON.stringify(o.json));
  created.push(o.json.orderId);
  const [order] = await sql`select order_number from orders where id = ${o.json.orderId}`;
  // Booked, picked up (the sale invoice is issued) and out for delivery.
  const ship = async (sellerId) => {
    const id = (await sql`insert into shipments (order_id, seller_id, status, shipped_by, awb) values (${o.json.orderId}, ${sellerId}, 'CREATED', 'LOIMART', ${"E2ERTO" + Math.random().toString(36).slice(2, 10)}) returning id`)[0].id;
    for (const status of ["PICKED_UP", "OUT_FOR_DELIVERY"]) { const m = await move(id, status); if (m.status !== 200) throw new Error(`Couldn't move parcel to ${status}: ${JSON.stringify(m.json)}`); }
    return id;
  };
  return { id: o.json.orderId, number: order.order_number, mine: await ship(me.id), theirs: await ship(theirs.seller_id) };
}
const move = (shipmentId, status) => admin(`/api/v1/shipments/${shipmentId}`, { method: "PATCH", body: { status } });
const upcoming = async () => ((await seller("/api/v1/payouts")).json?.upcoming ?? []).map((l) => l.orderNumber);
const orderRow = async (id) => (await sql`select o.status, o.delivered_at, (select status from payments where order_id = o.id limit 1) payment from orders o where o.id = ${id}`)[0];

// --- my parcel delivered, the other seller's refused
const a = await twoSellerOrder();
let r = await move(a.mine, "DELIVERED");
check("my parcel is delivered", r.status === 200, JSON.stringify(r.json));
check("I'm due payment from my own delivery, while the other parcel is still out", (await upcoming()).includes(a.number));
check("…the order isn't delivered yet", (await orderRow(a.id)).status !== "DELIVERED");
r = await move(a.theirs, "RETURNED");
check("the other parcel is refused and goes back to its seller (RTO)", r.status === 200, JSON.stringify(r.json));
let o = await orderRow(a.id);
check("the order now counts as delivered", o.status === "DELIVERED" && Boolean(o.delivered_at), JSON.stringify(o));
check("…and the Cash on Delivery as collected", o.payment === "CAPTURED", o.payment);
check("I'm still due payment for my parcel", (await upcoming()).includes(a.number));
const t = await stock(theirs.variant_id);
check("the refused unit is free to sell again (reservation released)", t.reserved === before.theirs.reserved && t.on_hand === before.theirs.on_hand, JSON.stringify({ before: before.theirs, now: t }));
const [credit] = await sql`select count(*)::int n from invoices where order_id = ${a.id} and seller_id = ${theirs.seller_id} and kind = 'CREDIT_NOTE'`;
check("the refused parcel's sale invoice is reversed", credit.n === 1, String(credit.n));

// --- the other way round: mine refused, theirs delivered
const b = await twoSellerOrder();
await move(b.theirs, "DELIVERED");
await move(b.mine, "RETURNED");
check("when my parcel is refused, I'm not paid for it", !(await upcoming()).includes(b.number));
check("…the order is still delivered for the parcel that arrived", (await orderRow(b.id)).status === "DELIVERED");
const m = await stock(mine.variant_id);
check("…and my unit is back on sale", m.reserved === before.mine.reserved, JSON.stringify({ before: before.mine, now: m }));

// --- a parcel that's back can't be cancelled out of stock twice
const c = await twoSellerOrder();
await move(c.mine, "RETURNED");
await move(c.theirs, "RETURNED");
await sql`update orders set status = 'CONFIRMED' where id = ${c.id}`;
r = await admin(`/api/v1/orders/${c.id}`, { method: "PATCH", body: { status: "CANCELLED", notes: "Both parcels refused" } });
const after = { mine: await stock(mine.variant_id), theirs: await stock(theirs.variant_id) };
check("cancelling an order whose parcels came back doesn't release their stock twice", r.status === 200 && after.mine.reserved === before.mine.reserved && after.theirs.reserved === before.theirs.reserved, JSON.stringify({ status: r.status, before, after }));

await tidy();
const [left] = await sql`select count(*)::int n from orders where id = any(${created}::uuid[])`;
check("test data cleaned up", left.n === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
