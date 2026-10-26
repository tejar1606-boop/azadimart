// End-to-end test for returns: the shopper asks for a return on a delivered
// order (within the return window), the seller approves / books pickup /
// receives it (stock back), LOIMART refunds the customer (Cash on Delivery:
// by bank/UPI with a reference), rejections need a reason the shopper sees,
// and the admin Returns page lists everything. Requires the demo seed and the
// apps (test server) against a NON-PRODUCTION database. Cleans up after itself.
//   ALLOW_E2E=YES pnpm e2e:returns
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

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
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  return async (path, { method = "GET", body, raw } = {}) => {
    const headers = { cookie, origin: base, "x-forwarded-for": ip };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = [...cookie.split("; ").filter((c) => c && !set.some((s) => s.startsWith(c.split("=")[0] + "="))), ...set.map((c) => c.split(";")[0])].join("; ");
    return { status: res.status, text: raw ? await res.text() : null, json: raw ? null : await res.json().catch(() => null) };
  };
}

const orders = [];
async function tidy() {
  for (const id of orders) {
    const rets = await sql`select id from returns where order_id = ${id}`;
    for (const r of rets) {
      await sql`delete from invoices where source_key = ${"RETURN:" + r.id}`.catch(() => undefined);
      await sql`delete from seller_charges where kind = 'RETURN_SHIPPING' and reference_id = ${r.id}`;
      await sql`delete from audit_logs where entity_type = 'return' and entity_id = ${r.id}`;
    }
    await sql`delete from refunds where order_id = ${id}`;
    await sql`delete from customer_wallet_entries where order_id = ${id} and kind = 'ADJUSTMENT'`;
    await sql`delete from inventory_movements where reference_type = 'CUSTOMER_RETURN' and reference_id = ${id}`;
    await sql`delete from returns where order_id = ${id}`;
    await sql`update orders set status = 'CANCELLED' where id = ${id}`;
  }
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });

const shop = client(SF), seller = client(SE), admin = client(AD), anon = client(AD);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
const products = await sql`select v.id variant_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  join sellers sl on sl.id = p.seller_id join users su on su.id = sl.user_id
  where su.email = 'demo.seller@azadimart.test' and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 5 and v.price_paise between 20000 and 200000 order by p.created_at desc limit 2`;
if (products.length < 2) throw new Error("Need two stocked live demo-seller products.");
const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "12 MG Road", city: "Vijayawada", state: "Andhra Pradesh", postalCode: "520010", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: products[0].variant_id, quantity: 2 } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: products[1].variant_id, quantity: 1 } });
const placed = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD", useWallet: false } });
const orderId = placed.json?.orderId;
if (!orderId) throw new Error("Checkout failed: " + JSON.stringify(placed.json));
orders.push(orderId);
const lines = await sql`select id, variant_id, quantity, unit_price_paise, seller_discount_paise from order_items where order_id = ${orderId} order by quantity desc`;
const [two, one] = lines;

check("can't return before delivery", (await shop(`/api/v1/orders/${orderId}/returns`, { method: "POST", body: { items: [{ orderItemId: two.id, quantity: 1 }], reason: "x" } })).status === 409);
await sql`update orders set status = 'DELIVERED', delivered_at = now() - interval '1 day' where id = ${orderId}`;
await sql`update payments set status = 'CAPTURED' where order_id = ${orderId}`;
let g = (await shop(`/api/v1/orders/${orderId}/returns`)).json;
check("shopper: return window open", g?.canReturn === true && g.windowDays > 0 && g.items.length === 0);

let r = await shop(`/api/v1/orders/${orderId}/returns`, { method: "POST", body: { items: [{ orderItemId: two.id, quantity: 1 }], reason: "Damaged or defective: cracked" } });
check("shopper: return requested", r.status === 201 && r.json?.returns?.length === 1, JSON.stringify(r.json));
const retId = r.json.returns[0].id;
check("shopper: can't ask for more than bought", (await shop(`/api/v1/orders/${orderId}/returns`, { method: "POST", body: { items: [{ orderItemId: two.id, quantity: 2 }], reason: "x" } })).status === 422);

const sl = (await seller("/api/v1/returns")).json;
const mine = sl?.items?.find((x) => x.id === retId);
check("seller: sees the request (to do)", mine?.status === "REQUESTED" && mine.items[0].quantity === 1 && mine.reason.includes("cracked"));
check("seller: customer's first name only", mine && !mine.customerName.includes(" "), mine?.customerName);
const attention = await seller("/notices", { raw: true });
check("seller: notice about returns", attention.text.includes("your action"));
check("seller: reject needs a reason", (await seller(`/api/v1/returns/${retId}`, { method: "POST", body: { status: "REJECTED" } })).status === 400);
check("seller: approve", (await seller(`/api/v1/returns/${retId}`, { method: "POST", body: { status: "APPROVED" } })).json?.status === "APPROVED");
check("seller: can't skip to received", (await seller(`/api/v1/returns/${retId}`, { method: "POST", body: { status: "RECEIVED" } })).status === 409);
check("seller: pickup booked", (await seller(`/api/v1/returns/${retId}`, { method: "POST", body: { status: "PICKUP_SCHEDULED" } })).json?.status === "PICKUP_SCHEDULED");
check("admin: can't refund before received", (await admin(`/api/v1/returns/${retId}/refund`, { method: "POST", body: { method: "MANUAL", reference: "UTR123456" } })).status === 409);
const stock0 = (await sql`select on_hand from inventory where variant_id = ${two.variant_id}`)[0].on_hand;
check("seller: received", (await seller(`/api/v1/returns/${retId}`, { method: "POST", body: { status: "RECEIVED" } })).json?.status === "RECEIVED");
check("stock back up by 1", (await sql`select on_hand from inventory where variant_id = ${two.variant_id}`)[0].on_hand === stock0 + 1);

const al = (await admin("/api/v1/returns?status=RECEIVED")).json;
check("admin: in 'to refund'", al?.items?.some((x) => x.id === retId && x.storeName && x.customerName));
const q = (await admin(`/api/v1/returns/${retId}/refund`)).json;
const expectGoods = Math.round((two.unit_price_paise * two.quantity - two.seller_discount_paise) / two.quantity);
check("refund quote = what they paid for the piece", q?.goodsPaise === expectGoods && q.toCustomerPaise === expectGoods - q.lessDiscountPaise - q.toWalletPaise && q.payment?.method === "COD", JSON.stringify(q));
check("COD: gateway refund refused", (await admin(`/api/v1/returns/${retId}/refund`, { method: "POST", body: { method: "GATEWAY" } })).status === 409);
check("manual refund needs a reference", (await admin(`/api/v1/returns/${retId}/refund`, { method: "POST", body: { method: "MANUAL", reference: "" } })).status === 400);
check("can't refund more than paid", (await admin(`/api/v1/returns/${retId}/refund`, { method: "POST", body: { method: "MANUAL", reference: "UTR1", amountPaise: 99_999_999 } })).status === 409);
r = await admin(`/api/v1/returns/${retId}/refund`, { method: "POST", body: { method: "MANUAL", reference: "UTR998877" } });
check("admin: refunded", r.status === 200 && r.json?.refundedPaise === q.toCustomerPaise, JSON.stringify(r.json));
const [refund] = await sql`select status, amount_paise, reason from refunds where order_id = ${orderId}`;
check("refund recorded with the UTR", refund?.status === "COMPLETED" && refund.amount_paise === q.toCustomerPaise && refund.reason.includes("UTR998877"));
check("COD payment stays 'captured'", (await sql`select status from payments where order_id = ${orderId}`)[0].status === "CAPTURED");
check("can't refund twice", (await admin(`/api/v1/returns/${retId}/refund`, { method: "POST", body: { method: "MANUAL", reference: "UTR998877" } })).status === 409);
g = (await shop(`/api/v1/orders/${orderId}/returns`)).json;
check("shopper: sees Refunded", g.items.some((x) => x.id === retId && x.status === "REFUNDED"));
check("order stays delivered (not every piece back)", (await sql`select status from orders where id = ${orderId}`)[0].status === "DELIVERED");

// A second request, rejected by LOIMART with a reason the shopper sees.
r = await shop(`/api/v1/orders/${orderId}/returns`, { method: "POST", body: { items: [{ orderItemId: one.id, quantity: 1 }], reason: "Size or fit issue" } });
const ret2 = r.json?.returns?.[0]?.id;
check("admin: reject needs a reason", (await admin(`/api/v1/returns/${ret2}`, { method: "POST", body: { status: "REJECTED", notes: "" } })).status === 400);
check("admin: reject", (await admin(`/api/v1/returns/${ret2}`, { method: "POST", body: { status: "REJECTED", notes: "Item was used and tags removed" } })).json?.status === "REJECTED");
g = (await shop(`/api/v1/orders/${orderId}/returns`)).json;
check("shopper: sees why it was rejected", g.items.some((x) => x.id === ret2 && x.rejectionReason === "Item was used and tags removed"));
check("rejected item can be asked again", (await shop(`/api/v1/orders/${orderId}/returns`, { method: "POST", body: { items: [{ orderItemId: one.id, quantity: 1 }], reason: "Wrong item sent" } })).status === 201);
check("admin search finds by order number", (await admin(`/api/v1/returns?status=ALL&q=${encodeURIComponent(placed.json.orderNumber ?? (await sql`select order_number from orders where id = ${orderId}`)[0].order_number)}`)).json.items.length === 3);
const audit = await sql`select metadata from audit_logs where entity_type = 'return' and entity_id = ${ret2}`;
check("admin action audited", audit.some((a) => a.metadata.by === "ADMIN" && a.metadata.to === "REJECTED"));

const page = await admin("/returns", { raw: true });
check("admin Returns page: no more 'coming soon'", page.status === 200 && !/coming soon/i.test(page.text) && page.text.includes("Search order, customer, seller or product"));
check("seller Returns page", (await seller("/returns", { raw: true })).status === 200);
check("not signed in: refused", (await anon("/api/v1/returns")).status === 401 && (await anon(`/api/v1/returns/${retId}/refund`, { method: "POST", body: {} })).status === 401);

await sql`update orders set delivered_at = now() - interval '30 days' where id = ${orderId}`;
g = (await shop(`/api/v1/orders/${orderId}/returns`)).json;
check("window closed after the return days", g.canReturn === false);
check("can't ask after the window", (await shop(`/api/v1/orders/${orderId}/returns`, { method: "POST", body: { items: [{ orderItemId: two.id, quantity: 1 }], reason: "late" } })).status === 409);

await tidy();
check("test returns removed", (await sql`select count(*)::int n from returns where order_id = ${orderId}`)[0].n === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
