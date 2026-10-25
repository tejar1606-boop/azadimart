// End-to-end test for cashback on every order and the automatic LOIMART
// offer: checkout applies the best offer by itself; every order shows a
// cashback (2% of what the shopper pays for the items, up to ₹50, whole
// rupees) that goes into the wallet only after the return window closes with
// nothing returned or replaced (a rejected return still gets it, an open one
// waits); the seller pays their share from the payout only when it's given;
// Admin changes the rules or switches it off. Requires the demo seed and the
// apps (test server) against a NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… SELLER_URL=… ADMIN_URL=… pnpm e2e:order-cashback
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const clearLimits = () => sql`delete from rate_limit_buckets where key like 'checkout:%' or key like 'register:%' or key like 'login:%' or key like 'ip:%' or key like 'coupon%'`;
await clearLimits();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
function client(base) {
  let cookie = "";
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: base, "x-forwarded-for": ip };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = [...cookie.split("; ").filter((c) => c && !set.some((s) => s.startsWith(c.split("=")[0] + "="))), ...set.map((c) => c.split(";")[0])].join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
const RUN = Date.now().toString(36);
const freePhone = async () => { for (;;) { const p = "6" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"); if (!(await sql`select 1 from users where phone = ${p}`).length) return p; } };

const [product] = await sql`select v.id variant_id, v.price_paise, p.id product_id, p.seller_id, p.coupon_max_discount_pct from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  join sellers sl on sl.id = p.seller_id join users su on su.id = sl.user_id
  where su.email = 'demo.seller@azadimart.test' and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 10 and v.price_paise between 40000 and 200000 order by p.created_at desc limit 1`;
if (!product) throw new Error("Need a stocked live demo-seller product between ₹400 and ₹2,000.");
const saved = (await sql`select value from platform_settings where key = 'order_cashback'`)[0]?.value;
const orders = [], couponIds = [];
let delivered = 0, email;

const shop = client(SF), seller = client(SE), admin = client(AD);
async function tidy() {
  await sql`update products set coupon_max_discount_pct = ${product.coupon_max_discount_pct} where id = ${product.product_id}`;
  for (const id of couponIds) await admin(`/api/v1/coupons/${id}`, { method: "DELETE" });
  if (orders.length) {
    await sql`delete from order_cashbacks where order_id = any(${orders}::uuid[])`;
    await sql`delete from coupon_redemptions where order_id = any(${orders}::uuid[])`;
    await sql`delete from return_items where return_id in (select id from returns where order_id = any(${orders}::uuid[]))`;
    await sql`delete from returns where order_id = any(${orders}::uuid[])`;
  }
  for (const id of orders) await sql`update orders set status = 'CANCELLED' where id = ${id} and status <> 'CANCELLED'`;
  if (delivered) await sql`update inventory set on_hand = on_hand + ${delivered} where variant_id = ${product.variant_id}`;
  await sql`delete from platform_settings where key = 'order_cashback'`;
  if (saved) await sql`insert into platform_settings (key, value) values ('order_cashback', ${JSON.stringify(saved)}::jsonb)`;
  if (email) await sql`update users set status = 'DISABLED' where email = ${email}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });
await sql`delete from platform_settings where key = 'order_cashback'`; // default rules: 2% up to ₹50

// A new shopper, so the wallet starts empty.
email = `e2e.cashback.${RUN}@loimart.test`;
let r = await shop("/api/auth/register", { method: "POST", body: { fullName: "E2E Cashback Kavya", email, phone: await freePhone(), password: PW } });
if (r.status !== 201) throw new Error("Sign-up failed: " + JSON.stringify(r.json));
await shop("/api/auth/login", { method: "POST", body: { email, password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "7 Park Street", city: "Kolkata", state: "West Bengal", postalCode: "700016", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;

const rupees = (paise) => Math.floor(paise / 100) * 100;
const expected = (itemsPaise, pctBps = 200, max = 5000) => rupees(Math.min(Math.floor(itemsPaise * pctBps / 10000), max || Infinity));
async function fillCart() {
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity: 1 } });
  return (await shop("/api/v1/cart")).json;
}
async function buy(couponCode) {
  await fillCart();
  const o = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD", useWallet: false, couponCode } });
  if (!o.json?.orderId) throw new Error("Checkout failed: " + o.status + " " + JSON.stringify(o.json));
  orders.push(o.json.orderId);
  return o.json;
}
async function deliver(orderId) {
  const [s] = await sql`insert into shipments (order_id, seller_id, status, shipped_by, shipping_fee_paise, awb) values (${orderId}, ${product.seller_id}, 'OUT_FOR_DELIVERY', 'LOIMART', 0, ${"E2ECB" + Date.now() + Math.floor(Math.random() * 1000)}) returning id`;
  const d = await admin(`/api/v1/shipments/${s.id}`, { method: "PATCH", body: { status: "DELIVERED" } });
  if (d.status !== 200) throw new Error("Delivery failed: " + JSON.stringify(d.json));
  delivered++;
}
// The return window closes (as if 8 days passed) and the daily job runs.
async function windowCloses(orderId) {
  await sql`update orders set delivered_at = now() - interval '8 days' where id = ${orderId}`;
  return admin("/api/cron/referral-rewards", { method: "POST" });
}
const wallet = () => shop("/api/v1/wallet").then((x) => x.json);
const orderPage = (id) => shop(`/api/v1/orders/${id}`).then((x) => x.json?.order);
async function askReturn(orderId) {
  const [line] = await sql`select id from order_items where order_id = ${orderId}`;
  return shop(`/api/v1/orders/${orderId}/returns`, { method: "POST", body: { items: [{ orderItemId: line.id, quantity: 1, reason: "Wrong size, want a replacement" }], reason: "Wrong size" } });
}

// --- the cart shows the rules; every order gets cashback
const cart = await fillCart();
check("the cart carries the cashback rules (2% up to ₹50)", cart?.cashback?.enabled && cart.cashback.percentBps === 200 && cart.cashback.maxPaise === 5000, JSON.stringify(cart?.cashback));
const first = await buy();
const want = expected(product.price_paise);
const lines = await sql`select coalesce(sum(cashback_paise), 0)::int n from order_items where order_id = ${first.orderId}`;
check("checkout promises 2% cashback in whole rupees, split onto the seller's lines", first.cashbackPaise === want && want > 0 && lines[0].n === want, `${first.cashbackPaise} vs ${want}`);
check("the cashback doesn't change what the shopper pays", first.grandTotalPaise === product.price_paise + first.platformFeePaise);
let page = await orderPage(first.orderId);
check("the order page says it comes after delivery", page?.cashback?.state === "PENDING" && page.cashback.amountPaise === want && page.cashback.at === null, JSON.stringify(page?.cashback));

// --- kept: added only after the return window
await deliver(first.orderId);
page = await orderPage(first.orderId);
check("delivered: still waiting, with the date it's due", page.cashback.state === "PENDING" && (new Date(page.cashback.at) - Date.now()) / 86400000 > 6.9, JSON.stringify(page.cashback));
await admin("/api/cron/referral-rewards", { method: "POST" });
check("…the daily job doesn't add it early", (await wallet()).balancePaise === 0);
const up = (await seller("/api/v1/payouts")).json?.upcoming?.find((u) => u.orderNumber === page.orderNumber);
check("the seller sees their share coming off the upcoming payment", up?.cashbackPaise === want && up.netPaise === up.grossPaise - up.commissionPaise - up.gstOnCommissionPaise - up.tcsPaise - up.tdsPaise - (up.shippingFeePaise ?? 0) - (up.sellerDiscountPaise ?? 0) - want, JSON.stringify(up));
r = await windowCloses(first.orderId);
let w = await wallet();
check("window closed with nothing returned: cashback lands in the wallet", r.json?.cashback?.granted >= 1 && w.balancePaise === want && w.entries.some((e) => e.kind === "ORDER_CASHBACK" && e.amountPaise === want), JSON.stringify(r.json));
check("the order page says it was added", (await orderPage(first.orderId)).cashback.state === "ADDED");
await windowCloses(first.orderId);
check("the job never pays the same order twice", (await wallet()).balancePaise === want);
const [line1] = await sql`select oi.id from order_items oi where oi.order_id = ${first.orderId}`;
const settled = await sql`select 1 from order_cashbacks where order_id = ${first.orderId} and status = 'GRANTED'`;
check("the seller pays their share for an order whose cashback was given", settled.length === 1 && line1);

// --- returned or replaced: nothing, and the seller pays nothing
const second = await buy();
await deliver(second.orderId);
r = await askReturn(second.orderId);
await windowCloses(second.orderId);
check("a return still waiting for a decision holds the cashback", r.status < 300 && !(await sql`select 1 from order_cashbacks where order_id = ${second.orderId}`).length && (await wallet()).balancePaise === want, JSON.stringify(r.json?.error ?? ""));
await sql`update returns set status = 'APPROVED' where order_id = ${second.orderId}`;
await windowCloses(second.orderId);
page = await orderPage(second.orderId);
check("an approved return or replacement: no cashback", (await wallet()).balancePaise === want && page.cashback.state === "NOT_GIVEN" && (await sql`select status from order_cashbacks where order_id = ${second.orderId}`)[0]?.status === "FORFEITED");
const third = await buy();
await deliver(third.orderId);
await askReturn(third.orderId);
await sql`update returns set status = 'REJECTED' where order_id = ${third.orderId}`;
await windowCloses(third.orderId);
check("a rejected return still gets the cashback", (await wallet()).balancePaise === 2 * want, String((await wallet()).balancePaise));
const fourth = await buy();
await shop(`/api/v1/orders/${fourth.orderId}/cancel`, { method: "POST", body: {} });
check("a cancelled order shows no cashback", (await orderPage(fourth.orderId)).cashback.state === "NOT_GIVEN");

// --- the best offer applies by itself; cashback is on what's paid after it
await sql`update products set coupon_max_discount_pct = 50 where id = ${product.product_id}`;
const code = `E2ECB${RUN}`.toUpperCase();
r = await admin("/api/v1/coupons", { method: "POST", body: { code, title: "E2E cashback offer", discountType: "PERCENTAGE", discountValue: 45, fundingType: "SELLERS", startsAt: new Date(Date.now() - 60_000).toISOString(), usageLimit: 5, scope: { productIds: [product.product_id] } } });
const couponId = r.json?.coupon?.id ?? r.json?.item?.id ?? r.json?.id;
if (couponId) couponIds.push(couponId);
const c2 = await fillCart();
r = await shop("/api/v1/coupons/best", { method: "POST", body: { cartId: c2.cartId } });
const off = Math.floor(product.price_paise * 45 / 100);
check("checkout finds the best offer without a code", r.status === 200 && r.json.code === code && r.json.discountPaise === off, JSON.stringify(r.json));
const fifth = await buy(code);
check("…and cashback is on the price after the offer", fifth.discountPaise === off && fifth.cashbackPaise === expected(product.price_paise - off), `${fifth.cashbackPaise}`);
r = await shop("/api/v1/coupons/best", { method: "POST", body: { cartId: (await fillCart()).cartId } });
check("an offer already used up by this shopper isn't offered again", r.status === 200 && r.json.code !== code, JSON.stringify(r.json));

// --- Admin
r = await admin("/api/v1/marketing/cashback");
check("Admin sees cashback given, waiting and not given", r.status === 200 && r.json.totals.granted >= 2 && r.json.totals.forfeited >= 1 && r.json.totals.waitingOrders >= 1, JSON.stringify(r.json?.totals));
r = await admin("/api/v1/marketing/cashback", { method: "PUT", body: { enabled: true, percentBps: 500, maxPaise: 1000 } });
const sixth = await buy();
check("Admin's new rule (5% up to ₹10) applies to new orders", r.status === 200 && sixth.cashbackPaise === expected(product.price_paise, 500, 1000), String(sixth.cashbackPaise));
check("…earlier orders keep what they were shown", (await orderPage(fifth.orderId)).cashback.amountPaise === fifth.cashbackPaise);
await admin("/api/v1/marketing/cashback", { method: "PUT", body: { enabled: false, percentBps: 500, maxPaise: 1000 } });
const seventh = await buy();
check("switched off: no cashback on new orders", seventh.cashbackPaise === 0 && (await orderPage(seventh.orderId)).cashback === null);
check("percentages above 20% are refused", (await admin("/api/v1/marketing/cashback", { method: "PUT", body: { enabled: true, percentBps: 2500, maxPaise: 0 } })).status === 400);
check("shoppers can't change the rules", [401, 403].includes((await shop(`${AD}/api/v1/marketing/cashback`, { method: "PUT", body: { enabled: true, percentBps: 2000, maxPaise: 0 } })).status));

await tidy();
await clearLimits();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
