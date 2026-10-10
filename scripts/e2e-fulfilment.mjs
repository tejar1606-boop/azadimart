// End-to-end test for order fulfilment, Amazon/Flipkart style: a new order
// gets a ship-by date and alerts its seller; the seller marks it packed or
// cancels it with a reason (stock released, customer sees who cancelled);
// orders shared with another seller become cancellation requests that admins
// approve or decline; the daily deadline job reminds, flags late orders and
// auto-cancels after 5 days; alert feed, settings and push devices. Requires
// the demo seed + catalogue seed and all three apps against a
// NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:fulfilment
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, headers: extra = {} } = {}) => {
    const headers = { cookie, ...extra };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
const shop = client(SF), admin = client(AD), seller = client(SE), anon = client(SE);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });

const [me] = await sql`select s.id from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const stockedMine = await sql`select v.id variant_id, p.id product_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved > 5 order by p.created_at limit 2`;
if (stockedMine.length < 2) throw new Error("Need two stocked live products from the demo seller.");
const [mine, lent] = stockedMine;
// The sample data has one stocking seller, so lend a product to another active
// seller for the shared-order checks; it goes back at the end.
const [otherSeller] = await sql`select id from sellers where status = 'ACTIVE' and id <> ${me.id} and business_state is not null and gstin is not null order by created_at limit 1`;
if (!otherSeller) throw new Error("Need a second active seller.");
await sql`update products set seller_id = ${otherSeller.id} where id = ${lent.product_id}`;
const theirs = lent;
async function giveBack() { await sql`update products set seller_id = ${me.id} where id = ${lent.product_id}`; }
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); giveBack().finally(() => process.exit(1)); });
const reserved = async (variantId) => (await sql`select reserved from inventory where variant_id = ${variantId}`)[0].reserved;

const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "7 Park Street", city: "Kolkata", state: "West Bengal", postalCode: "700016", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
const orders = [];
async function placeOrder(lines) {
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  for (const [variantId, quantity] of lines) await shop("/api/v1/cart", { method: "POST", body: { variantId, quantity } });
  const r = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
  if (r.json?.orderId) orders.push(r.json.orderId);
  return r;
}
const sellerOrder = async (id) => (await seller("/api/v1/orders")).json?.items?.find((o) => (o.id ?? o.orderId) === id);
const alertsFor = async (orderNumber) => ((await seller("/api/v1/notifications")).json?.items ?? []).filter((n) => n.title.includes(orderNumber));

// --- new order: ship-by date and an alert for the seller
await seller("/api/v1/notifications/settings", { method: "PUT", body: { newOrders: true, reminders: true, cancellations: true } });
const before = await reserved(mine.variant_id);
let r = await placeOrder([[mine.variant_id, 1]]);
check("customer places an order", r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const o1 = r.json.orderId;
const [row1] = await sql`select order_number, ship_by_at, created_at from orders where id = ${o1}`;
const days = (row1.ship_by_at - row1.created_at) / 86400000;
check("order gets a ship-by date 2 days out", Math.abs(days - 2) < 0.01, String(days));
check("seller gets a NEW_ORDER alert", (await alertsFor(row1.order_number)).some((n) => n.kind === "NEW_ORDER"));
let feed = (await seller(`/api/v1/notifications?after=${encodeURIComponent(new Date(Date.now() - 60000).toISOString())}`)).json;
check("live poll returns the new alert and an unread count", feed?.items?.some((n) => n.title.includes(row1.order_number)) && feed.unread >= 1, JSON.stringify({ n: feed?.items?.length, unread: feed?.unread }));
const seen = await sellerOrder(o1);
check("seller's order list shows the ship-by date", Boolean(seen?.shipByAt) && seen.sharedWithOtherSellers === false, JSON.stringify(seen && { shipByAt: seen.shipByAt, shared: seen.sharedWithOtherSellers }));

// --- packed, then cancelled by the seller with a reason
r = await seller(`/api/v1/orders/${o1}/packed`, { method: "POST" });
check("seller marks the order packed", r.status === 200 && r.json?.order?.status === "PACKED", String(r.status));
check("packing twice is refused", (await seller(`/api/v1/orders/${o1}/packed`, { method: "POST" })).status === 409);
check("cancel needs a listed reason", (await seller(`/api/v1/orders/${o1}/cancel`, { method: "POST", body: { reason: "Felt like it" } })).status === 400);
r = await seller(`/api/v1/orders/${o1}/cancel`, { method: "POST", body: { reason: "Out of stock", note: "Last piece damaged" } });
check("seller cancels their own order", r.status === 200 && r.json?.outcome === "CANCELLED", r.status + " " + JSON.stringify(r.json?.error ?? ""));
const [c1] = await sql`select status, cancelled_by, cancellation_reason, cancelled_at from orders where id = ${o1}`;
check("recorded as cancelled by the seller with the reason", c1.status === "CANCELLED" && c1.cancelled_by === "SELLER" && c1.cancellation_reason === "Out of stock: Last piece damaged" && c1.cancelled_at, JSON.stringify(c1));
check("stock released", (await reserved(mine.variant_id)) === before, `${before} → ${await reserved(mine.variant_id)}`);
const customerView = (await shop(`/api/v1/orders/${o1}`)).json;
const co = customerView?.order ?? customerView;
check("customer sees who cancelled and why", co?.cancelledBy === "SELLER" && co?.cancellationReason?.startsWith("Out of stock"), JSON.stringify({ by: co?.cancelledBy, reason: co?.cancellationReason }));
check("cancelled order can't be cancelled again", (await seller(`/api/v1/orders/${o1}/cancel`, { method: "POST", body: { reason: "Other" } })).status === 409);

// --- shared order: request, decline, request, approve
r = await placeOrder([[mine.variant_id, 1], [theirs.variant_id, 1]]);
check("customer orders from two sellers", r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const o2 = r.json.orderId;
check("order shows as shared with another seller", (await sellerOrder(o2))?.sharedWithOtherSellers === true);
check("shared order can't be marked packed by one seller", (await seller(`/api/v1/orders/${o2}/packed`, { method: "POST" })).status === 409);
r = await seller(`/api/v1/orders/${o2}/cancel`, { method: "POST", body: { reason: "Price or listing error" } });
check("cancelling a shared order makes a request", r.status === 202 && r.json?.outcome === "REQUESTED", String(r.status));
check("seller sees their request is pending", (await sellerOrder(o2))?.cancelRequestedByMe === true);
let listed = (await admin("/api/v1/orders")).json?.items?.find((o) => o.id === o2);
check("admin sees the request and reason", listed?.cancelRequestedAt && listed.cancelRequestReason === "Price or listing error" && listed.status === "CONFIRMED");
r = await admin(`/api/v1/orders/${o2}/cancel-request`, { method: "POST", body: { decision: "DECLINE" } });
check("admin declines", r.status === 200);
const [d2] = await sql`select status, cancel_requested_at from orders where id = ${o2}`;
check("declined: order stays open, request cleared", d2.status === "CONFIRMED" && d2.cancel_requested_at === null, JSON.stringify(d2));
await seller(`/api/v1/orders/${o2}/cancel`, { method: "POST", body: { reason: "Out of stock" } });
r = await admin(`/api/v1/orders/${o2}/cancel-request`, { method: "POST", body: { decision: "APPROVE" } });
const [a2] = await sql`select status, cancelled_by from orders where id = ${o2}`;
check("approved: whole order cancelled for the seller's reason", r.status === 200 && a2.status === "CANCELLED" && a2.cancelled_by === "SELLER", JSON.stringify(a2));
check("no request left to decide", (await admin(`/api/v1/orders/${o2}/cancel-request`, { method: "POST", body: { decision: "APPROVE" } })).status === 404);

// --- admin cancel with a reason alerts the seller
r = await placeOrder([[mine.variant_id, 1]]);
const o3 = r.json.orderId;
r = await admin(`/api/v1/orders/${o3}`, { method: "PATCH", body: { status: "CANCELLED", notes: "Payment could not be verified" } });
const [a3] = await sql`select order_number, cancelled_by, cancellation_reason from orders where id = ${o3}`;
check("admin cancels with a reason", r.status === 200 && a3.cancelled_by === "ADMIN" && a3.cancellation_reason === "Payment could not be verified", JSON.stringify(a3));
check("seller is alerted about the admin cancellation", (await alertsFor(a3.order_number)).some((n) => n.kind === "ORDER_CANCELLED_BY_ADMIN"));

// --- customer cancel alerts the seller
r = await placeOrder([[mine.variant_id, 1]]);
const o4 = r.json.orderId;
r = await shop(`/api/v1/orders/${o4}/cancel`, { method: "POST", body: {} });
const [a4] = await sql`select order_number, cancelled_by from orders where id = ${o4}`;
check("customer cancels; recorded as CUSTOMER", r.status === 200 && a4.cancelled_by === "CUSTOMER", r.status + " " + JSON.stringify(a4));
check("seller is alerted about the customer cancellation", (await alertsFor(a4.order_number)).some((n) => n.kind === "ORDER_CANCELLED_BY_CUSTOMER"));

// --- deadline job: reminder, late, auto-cancel
const due = (await placeOrder([[mine.variant_id, 1]])).json.orderId;
const late = (await placeOrder([[mine.variant_id, 1]])).json.orderId;
const stale = (await placeOrder([[mine.variant_id, 1]])).json.orderId;
await sql`update orders set ship_by_at = now() + interval '6 hours' where id = ${due}`;
await sql`update orders set created_at = now() - interval '3 days', ship_by_at = now() - interval '1 day' where id = ${late}`;
await sql`update orders set created_at = now() - interval '6 days', ship_by_at = now() - interval '4 days' where id = ${stale}`;
const beforeJob = await reserved(mine.variant_id);
check("deadline job refuses callers without the secret", [401, 403].includes((await anon(`${AD}/api/cron/order-deadlines`)).status));
check("deadline job refuses a wrong secret", (await anon(`${AD}/api/cron/order-deadlines`, { headers: { authorization: "Bearer wrong" } })).status === 401);
r = process.env.CRON_SECRET
  ? await anon(`${AD}/api/cron/order-deadlines`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  : await admin("/api/cron/order-deadlines", { method: "POST" });
check("deadline job runs", r.status === 200 && r.json?.ok, r.status + " " + JSON.stringify(r.json));
const nums = Object.fromEntries((await sql`select id, order_number, status, cancelled_by from orders where id in (${due}, ${late}, ${stale})`).map((o) => [o.id, o]));
check("reminder sent for an order due within 12 hours", (await alertsFor(nums[due].order_number)).some((n) => n.kind === "SHIP_BY_REMINDER") && nums[due].status === "CONFIRMED");
check("late alert for an order past its ship-by date", (await alertsFor(nums[late].order_number)).some((n) => n.kind === "ORDER_LATE") && nums[late].status === "CONFIRMED");
check("order unshipped after 5 days auto-cancelled", nums[stale].status === "CANCELLED" && nums[stale].cancelled_by === "SYSTEM", JSON.stringify(nums[stale]));
check("seller told about the auto-cancel", (await alertsFor(nums[stale].order_number)).some((n) => n.kind === "ORDER_AUTO_CANCELLED"));
check("auto-cancel releases stock", (await reserved(mine.variant_id)) === beforeJob - 1);
const again = process.env.CRON_SECRET
  ? await anon(`${AD}/api/cron/order-deadlines`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
  : await admin("/api/cron/order-deadlines", { method: "POST" });
check("running again doesn't repeat alerts", (await alertsFor(nums[due].order_number)).filter((n) => n.kind === "SHIP_BY_REMINDER").length === 1 && (await alertsFor(nums[late].order_number)).filter((n) => n.kind === "ORDER_LATE").length === 1, String(again.status));

// --- settings, read, push devices
r = await seller("/api/v1/notifications/settings", { method: "PUT", body: { newOrders: false, reminders: true, cancellations: true } });
check("seller turns off new-order alerts", r.status === 200 && (await seller("/api/v1/notifications/settings")).json?.settings?.newOrders === false);
check("bad settings rejected", (await seller("/api/v1/notifications/settings", { method: "PUT", body: { newOrders: "yes" } })).status === 400);
await seller("/api/v1/notifications/settings", { method: "PUT", body: { newOrders: true, reminders: true, cancellations: true } });
r = await seller("/api/v1/notifications/read", { method: "POST" });
check("marking alerts read clears the unread count", r.status === 200 && (await seller("/api/v1/notifications")).json?.unread === 0);
r = await seller("/api/v1/notifications/test", { method: "POST" });
check("test alert arrives", r.status === 200 && ((await seller("/api/v1/notifications")).json?.items?.[0]?.readAt ?? null) === null);
const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${Date.now()}`;
check("insecure push endpoint rejected", (await seller("/api/v1/push-subscriptions", { method: "POST", body: { endpoint: "http://x.test/push", keys: { p256dh: "x".repeat(20), auth: "y".repeat(12) } } })).status === 400);
r = await seller("/api/v1/push-subscriptions", { method: "POST", body: { endpoint, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } } });
check("browser push device saved", r.status === 201 && (await sql`select 1 from push_subscriptions where endpoint = ${endpoint} and seller_id = ${me.id}`).length === 1, String(r.status));
await seller("/api/v1/push-subscriptions", { method: "DELETE", body: { endpoint } });
check("push device removed", (await sql`select 1 from push_subscriptions where endpoint = ${endpoint}`).length === 0);

// --- access
check("signed-out users can't read alerts", [401, 403].includes((await anon("/api/v1/notifications")).status));
check("customers can't cancel as a seller", [401, 403].includes((await shop(`${SE}/api/v1/orders/${due}/cancel`, { method: "POST", body: { reason: "Other" } })).status));
check("sellers can't decide cancellation requests", [401, 403].includes((await seller(`${AD}/api/v1/orders/${due}/cancel-request`, { method: "POST", body: { decision: "APPROVE" } })).status));
const [other] = await sql`select o.id from orders o where o.status = 'CONFIRMED' and not exists (select 1 from order_items i where i.order_id = o.id and i.seller_id = ${me.id}) limit 1`;
if (other) check("seller can't cancel another seller's order", (await seller(`/api/v1/orders/${other.id}/cancel`, { method: "POST", body: { reason: "Other" } })).status === 404);

// --- tidy up: cancel the remaining test orders (releases their stock)
for (const id of orders) {
  const [o] = await sql`select status from orders where id = ${id}`;
  if (o.status !== "CANCELLED") await admin(`/api/v1/orders/${id}`, { method: "PATCH", body: { status: "CANCELLED", notes: "E2E test clean-up" } });
}
await giveBack();
// Move the test orders out of the 90-day window so they don't skew the demo store's performance and sales figures.
await sql`update orders set created_at = created_at - interval '1 year', ship_by_at = ship_by_at - interval '1 year', cancelled_at = cancelled_at - interval '1 year' where id = any(${orders})`;
const open = await sql`select count(*)::int n from orders where id = any(${orders}) and status <> 'CANCELLED'`;
check("test orders cleaned up", open[0].n === 0, JSON.stringify(open[0]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
