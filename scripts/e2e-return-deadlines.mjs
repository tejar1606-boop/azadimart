// End-to-end test for return deadlines: a request the seller doesn't answer
// in 48 hours is approved by LOIMART automatically; sellers are reminded
// before a deadline and told when they're late; late returns show in Admin →
// Returns → Late. Requires the demo seed, CRON_SECRET and the apps (test
// server) against a NON-PRODUCTION database. Cleans up after itself.
//   ALLOW_E2E=YES pnpm e2e:return-deadlines
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");
if (!process.env.CRON_SECRET) throw new Error("Set CRON_SECRET (the test server's) to run the deadline job.");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'checkout:%' or key like 'login:%' or key like 'ip:%'`;
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, headers: extra = {} } = {}) => {
    const headers = { cookie, origin: base, ...extra };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
const shop = client(SF), seller = client(SE), admin = client(AD), anon = client(AD);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
const [me] = await sql`select s.id from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const [product] = await sql`select v.id variant_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 3 and v.price_paise >= 30100 order by p.created_at limit 1`;
if (!product) throw new Error("Need a stocked live demo-seller product.");
const started = new Date();
const orders = [];
async function tidy() {
  for (const id of orders) {
    for (const r of await sql`select id from returns where order_id = ${id}`) await sql`delete from audit_logs where entity_type = 'return' and entity_id = ${r.id}`;
    await sql`delete from returns where order_id = ${id}`;
    await sql`update orders set status = 'CANCELLED', created_at = created_at - interval '1 year' where id = ${id}`;
  }
  if (orders.length) await sql`update inventory set reserved = greatest(0, reserved - ${orders.length}) where variant_id = ${product.variant_id}`;
  await sql`delete from seller_notifications where seller_id = ${me.id} and kind like 'RETURN_%' and created_at >= ${started}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });

const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "12 MG Road", city: "Vijayawada", state: "Andhra Pradesh", postalCode: "520010", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
async function deliveredReturn() {
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity: 1 } });
  const placed = (await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD", useWallet: false } })).json;
  if (!placed?.orderId) throw new Error("Checkout failed: " + JSON.stringify(placed));
  orders.push(placed.orderId);
  await sql`update orders set status = 'DELIVERED', delivered_at = now() - interval '1 day' where id = ${placed.orderId}`;
  const [line] = await sql`select id from order_items where order_id = ${placed.orderId}`;
  const r = await shop(`/api/v1/orders/${placed.orderId}/returns`, { method: "POST", body: { items: [{ orderItemId: line.id, quantity: 1 }], reason: "Size or fit issue" } });
  return r.json?.returns?.[0]?.id;
}
const job = () => anon("/api/cron/return-deadlines", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
const notes = async (id, kind) => (await sql`select title, body from seller_notifications where seller_id = ${me.id} and kind = ${kind} and created_at >= ${started} and dedupe_key like ${"%" + id + "%"}`);

check("job refuses callers without the secret", (await anon("/api/cron/return-deadlines")).status === 401);

// 1. Seller never replies → approved by LOIMART after 48 hours (reminded before that).
const a = await deliveredReturn();
await sql`update returns set updated_at = now() - interval '30 hours' where id = ${a}`;
let r = await job();
check("job runs", r.status === 200 && r.json?.ok, JSON.stringify(r.json));
check("reminded in the last 24 hours", (await notes(a, "RETURN_REMINDER")).length === 1);
await job();
check("reminder sent only once", (await notes(a, "RETURN_REMINDER")).length === 1);
await sql`update returns set updated_at = now() - interval '49 hours' where id = ${a}`;
r = await job();
const [ra] = await sql`select status from returns where id = ${a}`;
check("no reply in 48 hours: approved automatically", ra.status === "APPROVED" && r.json.autoApproved >= 1, JSON.stringify({ ra, r: r.json }));
const audit = await sql`select metadata from audit_logs where entity_type = 'return' and entity_id = ${a} and metadata->>'to' = 'APPROVED'`;
check("audited as approved by the system", audit[0]?.metadata?.by === "SYSTEM");
check("seller told it was approved by LOIMART", (await notes(a, "RETURN_AUTO_APPROVED")).some((n) => n.title.includes("approved by LOIMART")));
check("shopper sees it approved", (await shop(`/api/v1/orders/${orders[0]}/returns`)).json?.items?.some((x) => x.id === a && x.status === "APPROVED"));

// 2. Pickup not booked in 2 days → late (seller told, admin sees it under Late).
await sql`update returns set updated_at = now() - interval '3 days' where id = ${a}`;
await job();
check("pickup not booked: seller told it's late", (await notes(a, "RETURN_LATE")).length === 1);
check("admin Late tab lists it", (await admin("/api/v1/returns?status=LATE")).json?.items?.some((x) => x.id === a));
check("seller Late tab lists it", (await seller("/api/v1/returns?status=LATE")).json?.items?.some((x) => x.id === a));
check("late count", (await admin("/api/v1/returns?status=OPEN")).json?.late >= 1);

// 3. Pickup booked but not marked received in 7 days → late again (new step, new alert).
await seller(`/api/v1/returns/${a}`, { method: "POST", body: { status: "PICKUP_SCHEDULED" } });
check("on time again after moving on", !(await admin("/api/v1/returns?status=LATE")).json?.items?.some((x) => x.id === a));
await sql`update returns set updated_at = now() - interval '8 days' where id = ${a}`;
await job();
check("not marked received in 7 days: late alert", (await notes(a, "RETURN_LATE")).length === 2);
check("LOIMART can mark it received", (await admin(`/api/v1/returns/${a}`, { method: "POST", body: { status: "RECEIVED", notes: "Courier confirms delivered to seller" } })).json?.status === "RECEIVED");

// 4. A seller who answers in time isn't overridden.
const b = await deliveredReturn();
await seller(`/api/v1/returns/${b}`, { method: "POST", body: { status: "REJECTED", notes: "Item used" } });
await sql`update returns set updated_at = now() - interval '5 days' where id = ${b}`;
await job();
check("rejected in time: left alone", (await sql`select status from returns where id = ${b}`)[0].status === "REJECTED");

// Undo the received step's side effects for the test item.
await sql`update inventory set on_hand = on_hand - 1 where variant_id = ${product.variant_id}`;
await sql`delete from inventory_movements where reference_type = 'CUSTOMER_RETURN' and reference_id = any(${orders})`;
await sql`delete from seller_charges where kind = 'RETURN_SHIPPING' and reference_id = ${a}`;
await sql`delete from invoices where source_key = ${"RETURN:" + a}`.catch(() => undefined);
await tidy();
check("test data removed", (await sql`select count(*)::int n from returns where order_id = any(${orders})`)[0].n === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
