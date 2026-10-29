// End-to-end test for wallet money LOIMART adds and refunds of cancelled
// prepaid orders: Admin adds money to a shopper's wallet (all of it usable on
// one order, unlike the welcome bonus, which stays at ₹50 an order); a shopper
// cancelling an order paid online chooses the wallet (instant, full use, never
// expires) or the original payment method (queued for the gateway, or paid by
// bank/UPI from Admin → Payments). Deletes everything it creates.
// Requires the demo seed + catalogue seed and the apps (test server) against a
// NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… ADMIN_URL=… pnpm e2e:wallet-refunds
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const clearLimits = () => sql`delete from rate_limit_buckets where key like 'checkout:%' or key like 'register:%' or key like 'otp%' or key like 'login:%' or key like 'ip:%'`;
await clearLimits();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base, ip) {
  let cookie = "";
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
const testIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const freePhone = async () => { for (;;) { const p = "6" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"); if (!(await sql`select 1 from users where phone = ${p}`).length) return p; } };

const orderIds = [];
const customerIds = [];
const admin = client(AD, testIp());
async function tidy() {
  for (const id of orderIds) {
    const [o] = await sql`select status from orders where id = ${id}`;
    // Put back reserved stock for any order the test didn't manage to cancel.
    if (o && o.status !== "CANCELLED") for (const i of await sql`select variant_id, quantity from order_items where order_id = ${id}`) await sql`update inventory set reserved = greatest(reserved - ${i.quantity}, 0) where variant_id = ${i.variant_id}`;
    const refundIds = (await sql`select id from refunds where order_id = ${id}`).map((r) => r.id);
    await sql`delete from audit_logs where entity_id = any(${[id, ...refundIds]}::text[])`;
    await sql`delete from refunds where order_id = ${id}`;
    await sql`delete from coupon_redemptions where order_id = ${id}`;
    await sql`delete from customer_wallet_entries where order_id = ${id}`;
    await sql`delete from inventory_movements where reference_id = ${id}`;
    await sql`delete from payments where order_id = ${id}`;
    await sql`delete from order_items where order_id = ${id}`;
    await sql`delete from orders where id = ${id}`;
  }
  for (const id of customerIds) {
    const [c] = await sql`select user_id from customers where id = ${id}`;
    await sql`delete from audit_logs where entity_id = ${id}`;
    await sql`delete from signup_bonus_claims where customer_id = ${id}`;
    await sql`delete from customers where id = ${id}`; // addresses, cart and wallet go with it
    if (c) await sql`delete from users where id = ${c.user_id} and role = 'CUSTOMER'`; // sessions and OTPs go with it
  }
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });

// --- a shopper with the ₹101 welcome bonus
const shopper = client(SF, testIp());
const email = `e2e.walletrefund.${RUN}@loimart.test`;
const phone = await freePhone();
let r = await shopper("/api/auth/register", { method: "POST", body: { fullName: "E2E Wallet Refund", email, phone, password: PW } });
if (r.status !== 201) throw new Error("Register failed: " + JSON.stringify(r.json));
const customerId = r.json.customerId;
customerIds.push(customerId);
await shopper("/api/auth/login", { method: "POST", body: { email, password: PW } });
await sql`update login_otps set created_at = now() - interval '5 minutes' where phone = ${phone}`;
const sent = await shopper("/api/v1/wallet/verify-phone", { method: "POST", body: {} });
await shopper("/api/v1/wallet/verify-phone", { method: "POST", body: { code: sent.json?.devCode } });
r = await shopper("/api/v1/wallet/claim", { method: "POST", body: { deviceId: randomBytes(16).toString("hex"), fingerprint: randomBytes(32).toString("hex") } });
const bonus = r.json?.granted ? r.json.amountPaise : 0;
if (!bonus) console.log("  (no welcome bonus on this database: " + JSON.stringify(r.json) + ")");

// --- Admin adds wallet money
r = await shopper(`${AD}/api/v1/customers/${customerId}/wallet`, { method: "POST", body: { amountPaise: 50000, reason: "Sorry" } });
check("a shopper can't add wallet money through Admin", [401, 403].includes(r.status), String(r.status));
r = await admin(`/api/v1/customers/${customerId}/wallet`, { method: "POST", body: { amountPaise: 0, reason: "Sorry for the delay" } });
check("a zero amount is refused", r.status === 400, String(r.status));
r = await admin(`/api/v1/customers/${customerId}/wallet`, { method: "POST", body: { amountPaise: 50000, reason: "" } });
check("a reason is required", r.status === 400, String(r.status));
r = await admin(`/api/v1/customers/${customerId}/wallet`, { method: "POST", body: { amountPaise: 50000, reason: "Sorry for the delay", orderNumber: "AZM-NOT-THEIRS" } });
check("an order number that isn't the customer's is refused", r.status === 400 || r.status === 422, String(r.status));
r = await admin(`/api/v1/customers/${customerId}/wallet`, { method: "POST", body: { amountPaise: 150000, reason: "Sorry for the delay" } });
check("Admin adds ₹1,500 to the wallet", r.status === 201 && r.json?.entry?.amountPaise === 150000 && r.json.entry.expiresAt === null, JSON.stringify(r.json));
const [log] = await sql`select metadata from audit_logs where action = 'CUSTOMER_WALLET_CREDITED' and entity_id = ${customerId}`;
check("…it's in the audit log with the reason", log?.metadata?.reason === "Sorry for the delay");
let w = (await shopper("/api/v1/wallet")).json;
check("the shopper sees it, separate from the bonus", w?.fullPaise === 150000 && w.promoPaise === bonus && w.balancePaise === 150000 + bonus && w.entries.some((e) => e.kind === "ADMIN_CREDIT" && e.note === "Sorry for the delay"), JSON.stringify({ full: w?.fullPaise, promo: w?.promoPaise }));

// --- checkout: all the added money on one order, the bonus still ₹50
const [product] = await sql`select v.id variant_id, v.price_paise from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  join sellers sl on sl.id = p.seller_id join users su on su.id = sl.user_id
  where su.email = 'demo.seller@azadimart.test' and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 5 and v.price_paise between 40000 and 120000 order by p.created_at desc limit 1`;
const [cheap] = await sql`select v.id variant_id, v.price_paise from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  join sellers sl on sl.id = p.seller_id join users su on su.id = sl.user_id
  where su.email = 'demo.seller@azadimart.test' and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 3 and v.price_paise < 29900 order by v.price_paise desc limit 1`;
if (!product) throw new Error("Need a stocked live demo product between ₹400 and ₹1,200.");
const address = (await shopper("/api/v1/addresses", { method: "POST", body: { line1: "7 Park Street", city: "Kolkata", state: "West Bengal", postalCode: "700016", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
async function buy(variantId, useWallet, quantity = 1) {
  for (const item of (await shopper("/api/v1/cart")).json?.items ?? []) await shopper("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await shopper("/api/v1/cart", { method: "POST", body: { variantId, quantity } });
  const o = await shopper("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD", useWallet } });
  if (o.json?.orderId) orderIds.push(o.json.orderId); else console.log("  checkout:", o.status, JSON.stringify(o.json));
  return o;
}
r = await buy(product.variant_id, true, 2);
let [order] = await sql`select wallet_paise, subtotal_paise, discount_paise, grand_total_paise, shipping_paise, platform_fee_paise from orders where id = ${r.json?.orderId}`;
const items = order.subtotal_paise - order.discount_paise;
const promoUsed = bonus && items >= 29900 ? Math.min(bonus, 5000) : 0;
const expectWallet = Math.min(items, promoUsed + 150000);
check("the order uses ₹50 of the bonus plus the added money, up to the items' value", r.status === 201 && order.wallet_paise === expectWallet, JSON.stringify({ order, expectWallet }));
check("…delivery and the platform fee are still paid", order.grand_total_paise === items - expectWallet + order.shipping_paise + order.platform_fee_paise);
w = (await shopper("/api/v1/wallet")).json;
check("…and the rest of the bonus stays for later", w.promoPaise === bonus - promoUsed && w.fullPaise === 150000 - (expectWallet - promoUsed), JSON.stringify({ promo: w.promoPaise, full: w.fullPaise }));
r = await shopper(`/api/v1/orders/${r.json.orderId}/cancel`, { method: "POST", body: {} });
w = (await shopper("/api/v1/wallet")).json;
check("cancelling a COD order puts both kinds of money back", r.status === 200 && r.json.refund === null && w.promoPaise === bonus && w.fullPaise === 150000, JSON.stringify({ promo: w.promoPaise, full: w.fullPaise }));
if (cheap) {
  r = await buy(cheap.variant_id, true);
  [order] = await sql`select wallet_paise, subtotal_paise from orders where id = ${r.json?.orderId}`;
  check("added money works even on orders under ₹299 (the bonus doesn't)", r.status === 201 && order.wallet_paise === order.subtotal_paise, JSON.stringify(order));
  await shopper(`/api/v1/orders/${r.json.orderId}/cancel`, { method: "POST", body: {} });
}

// --- cancelled prepaid orders: the shopper chooses where the refund goes
async function prepaid() {
  const o = await buy(product.variant_id, false);
  // Online payment isn't switched on yet: record this order as paid by card through the gateway.
  await sql`update payments set provider = 'RAZORPAY', status = 'CAPTURED', provider_payment_id = ${"pay_e2e_" + randomBytes(6).toString("hex")} where order_id = ${o.json.orderId}`;
  const [p] = await sql`select amount_paise from payments where order_id = ${o.json.orderId}`;
  return { id: o.json.orderId, paid: p.amount_paise };
}
const before = (await shopper("/api/v1/wallet")).json;
const toWallet = await prepaid();
r = await shopper(`/api/v1/orders/${toWallet.id}/cancel`, { method: "POST", body: { reason: "Ordered by mistake", refundTo: "WALLET" } });
check("cancelling a prepaid order with refund to the wallet works", r.status === 200 && r.json.refund?.to === "WALLET" && r.json.refund.status === "COMPLETED" && r.json.refund.amountPaise === toWallet.paid, JSON.stringify(r.json));
w = (await shopper("/api/v1/wallet")).json;
const entry = w.entries.find((e) => e.kind === "CANCEL_REFUND" && e.orderId === toWallet.id);
check("…the money is in the wallet at once, never expiring, usable in full", w.fullPaise === before.fullPaise + toWallet.paid && entry?.expiresAt === null, JSON.stringify({ full: w.fullPaise, entry }));
let [pay] = await sql`select status from payments where order_id = ${toWallet.id}`;
check("…the payment shows as refunded", pay.status === "REFUNDED", pay.status);
let view = (await shopper(`/api/v1/orders/${toWallet.id}`)).json?.order;
check("…and the order page says it went to the wallet", view?.refund?.to === "WALLET" && view.refund.status === "COMPLETED", JSON.stringify(view?.refund));
r = await shopper(`/api/v1/orders/${toWallet.id}/cancel`, { method: "POST", body: { refundTo: "WALLET" } });
check("cancelling again can't refund twice", r.status === 409 && (await shopper("/api/v1/wallet")).json.fullPaise === w.fullPaise, String(r.status));

const toSource = await prepaid();
r = await shopper(`/api/v1/orders/${toSource.id}/cancel`, { method: "POST", body: { reason: "No longer need it", refundTo: "SOURCE" } });
check("refund to the original payment method is queued (gateway not set up yet)", r.status === 200 && r.json.refund?.to === "SOURCE" && r.json.refund.status === "PENDING" && r.json.refund.amountPaise === toSource.paid, JSON.stringify(r.json));
check("…nothing goes to the wallet", (await shopper("/api/v1/wallet")).json.fullPaise === w.fullPaise);
view = (await shopper(`/api/v1/orders/${toSource.id}`)).json?.order;
check("…the order page says it's on its way back", view?.refund?.to === "SOURCE" && view.refund.status === "PENDING");
const [refund] = await sql`select id from refunds where order_id = ${toSource.id}`;
r = await admin(`/api/v1/payments/refunds/${refund.id}`, { method: "POST", body: { action: "SEND" } });
check("Admin: sending through an unconfigured gateway explains what to do", r.status === 409 && /bank transfer/.test(r.json?.error?.message ?? ""), JSON.stringify(r.json?.error));
r = await admin(`/api/v1/payments/refunds/${refund.id}`, { method: "POST", body: { action: "PAID", reference: "" } });
check("Admin: marking it paid needs the UTR", r.status === 400);
r = await admin(`/api/v1/payments/refunds/${refund.id}`, { method: "POST", body: { action: "PAID", reference: "UTR" + RUN } });
[pay] = await sql`select status from payments where order_id = ${toSource.id}`;
check("Admin marks it paid by bank/UPI and the payment shows refunded", r.status === 200 && pay.status === "REFUNDED", pay.status);
view = (await shopper(`/api/v1/orders/${toSource.id}`)).json?.order;
check("…the shopper sees the refund as done", view?.refund?.status === "COMPLETED");
r = await admin(`/api/v1/payments/refunds/${refund.id}`, { method: "POST", body: { action: "PAID", reference: "UTR" + RUN } });
check("…and it can't be marked paid twice", r.status === 409);

const fallback = await prepaid();
r = await shopper(`/api/v1/orders/${fallback.id}/cancel`, { method: "POST", body: {} });
check("with no choice sent, the refund goes to the original payment method", r.status === 200 && r.json.refund?.to === "SOURCE");

await tidy();
await clearLimits();
const [left] = await sql`select count(*)::int n from customers where id = ${customerId}`;
check("test data removed", left.n === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
