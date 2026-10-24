// End-to-end test for the shopper wallet: a new shopper gets the ₹101 welcome
// bonus only after verifying their mobile by OTP; a second account on the same
// device, a recycled mobile number or too many sign-ups from one connection get
// nothing (and are listed in Admin with why); at checkout up to ₹50 comes off
// orders of ₹299+, LOIMART bears it on the invoice, and cancelling gives it back.
// Requires the demo seed + catalogue seed and the apps (test server, console
// SMS) against a NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… ADMIN_URL=… pnpm e2e:customer-wallet
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
const started = new Date();
const testIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const device = () => ({ deviceId: randomBytes(16).toString("hex"), fingerprint: randomBytes(32).toString("hex") });
const freePhone = async () => { for (;;) { const p = "6" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"); if (!(await sql`select 1 from users where phone = ${p}`).length) return p; } };
const users = [];

async function newShopper(name, { ip = testIp(), phone } = {}) {
  const c = client(SF, ip);
  const email = `e2e.wallet.${RUN}.${users.length}@loimart.test`;
  phone ??= await freePhone();
  const r = await c("/api/auth/register", { method: "POST", body: { fullName: name, email, phone, password: PW } });
  if (r.status !== 201) throw new Error("Register failed: " + JSON.stringify(r.json));
  users.push(email);
  await c("/api/auth/login", { method: "POST", body: { email, password: PW } });
  return { c, email, phone, customerId: r.json.customerId };
}
async function verify(s) {
  await sql`update login_otps set created_at = now() - interval '5 minutes' where phone = ${s.phone}`; // skip the resend wait
  const sent = await s.c("/api/v1/wallet/verify-phone", { method: "POST", body: {} });
  if (!sent.json?.devCode) throw new Error("No test code: " + JSON.stringify(sent.json));
  return s.c("/api/v1/wallet/verify-phone", { method: "POST", body: { code: sent.json.devCode } });
}
const claim = (s, signals) => s.c("/api/v1/wallet/claim", { method: "POST", body: signals });

const orders = [];
let savedSettings;
async function tidy() {
  for (const id of orders) await sql`update orders set status = 'CANCELLED' where id = ${id} and status <> 'CANCELLED'`;
  await sql`delete from platform_settings where key = 'customer_wallet'`;
  if (savedSettings) await sql`insert into platform_settings (key, value) values ('customer_wallet', ${JSON.stringify(savedSettings)}::jsonb)`;
  for (const email of users) await sql`update users set status = 'DISABLED' where email = ${email}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });
savedSettings = (await sql`select value from platform_settings where key = 'customer_wallet'`)[0]?.value;
await sql`delete from platform_settings where key = 'customer_wallet'`; // run on the default rules

// --- welcome bonus needs a verified mobile
const devA = device();
const a = await newShopper("E2E Wallet A");
let w = (await a.c("/api/v1/wallet")).json;
check("a new shopper starts with ₹0 and is asked to verify their mobile", w?.balancePaise === 0 && w.bonus.state === "VERIFY_PHONE" && w.rules.bonusPaise === 10100, JSON.stringify(w?.bonus));
let r = await claim(a, devA);
check("no bonus before the mobile is verified", r.status === 422, String(r.status));
r = await a.c("/api/v1/wallet/verify-phone", { method: "POST", body: { code: "000000" } });
check("a wrong code is refused", r.status >= 400);
r = await verify(a);
check("the right code verifies the mobile", r.status === 200 && r.json?.verified, JSON.stringify(r.json?.error ?? ""));
r = await claim(a, devA);
check("₹101 lands in the wallet", r.status === 200 && r.json?.granted && r.json.amountPaise === 10100, JSON.stringify(r.json));
w = (await a.c("/api/v1/wallet")).json;
const days = (new Date(w?.nextExpiry?.at) - Date.now()) / 86400000;
check("…shown with its expiry date (30 days)", w.balancePaise === 10100 && w.bonus.state === "CLAIMED" && days > 29 && days < 31, String(days));
r = await claim(a, devA);
check("claiming again gives nothing more", r.json?.alreadyClaimed && (await a.c("/api/v1/wallet")).json.balancePaise === 10100);

// --- abuse: same device, recycled number, one connection
const b = await newShopper("E2E Wallet B");
await verify(b);
r = await claim(b, devA);
check("a second account on the same device gets nothing", r.json?.granted === false && /device/.test(r.json.reason ?? ""), r.json?.reason);
check("…and is told why on their wallet", (await b.c("/api/v1/wallet")).json?.bonus.state === "NOT_ELIGIBLE");
const c2 = await newShopper("E2E Wallet C");
await verify(c2);
r = await claim(c2, { deviceId: device().deviceId, fingerprint: devA.fingerprint });
check("a new device ID with the same device fingerprint gets nothing", r.json?.granted === false && /device/.test(r.json.reason ?? ""), r.json?.reason);

const newNumber = await freePhone();
await sql`update users set phone = ${newNumber} where email = ${a.email}`; // A changes number; theirs goes to someone else
const d = await newShopper("E2E Wallet D", { phone: a.phone });
await verify(d);
r = await claim(d, device());
check("a mobile number that already got the bonus gets nothing", r.json?.granted === false && /mobile/.test(r.json.reason ?? ""), r.json?.reason);

const ip = testIp(), got = [];
for (let i = 0; i < 4; i++) {
  const s = await newShopper(`E2E Wallet IP${i}`, { ip });
  await verify(s);
  got.push((await claim(s, device())).json);
}
check("3 bonuses a day from one connection, the 4th is refused", got.slice(0, 3).every((x) => x?.granted) && got[3]?.granted === false && /connection/.test(got[3].reason ?? ""), JSON.stringify(got.map((x) => x?.granted)));

// --- checkout
const [product] = await sql`select v.id variant_id, v.price_paise from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  join sellers sl on sl.id = p.seller_id join users su on su.id = sl.user_id
  where su.email = 'demo.seller@azadimart.test' and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 3 and v.price_paise between 40000 and 200000 order by p.created_at desc limit 1`;
const [cheap] = await sql`select v.id variant_id, v.price_paise from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  join sellers sl on sl.id = p.seller_id join users su on su.id = sl.user_id
  where su.email = 'demo.seller@azadimart.test' and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 3 and v.price_paise < 29900 order by v.price_paise desc limit 1`;
if (!product) throw new Error("Need a stocked live product between ₹400 and ₹2,000.");
const address = (await a.c("/api/v1/addresses", { method: "POST", body: { line1: "7 Park Street", city: "Kolkata", state: "West Bengal", postalCode: "700016", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
async function buy(variantId, useWallet) {
  for (const item of (await a.c("/api/v1/cart")).json?.items ?? []) await a.c("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await a.c("/api/v1/cart", { method: "POST", body: { variantId, quantity: 1 } });
  const o = await a.c("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD", useWallet } });
  if (o.json?.orderId) orders.push(o.json.orderId); else console.log("  checkout:", o.status, JSON.stringify(o.json));
  return o;
}
if (cheap) {
  r = await buy(cheap.variant_id, true);
  const [o] = await sql`select wallet_paise from orders where id = ${r.json?.orderId}`;
  check("orders under ₹299 can't use the wallet", r.status === 201 && o?.wallet_paise === 0, JSON.stringify({ status: r.status, o }));
  await a.c(`/api/v1/orders/${r.json.orderId}/cancel`, { method: "POST", body: {} });
}
r = await buy(product.variant_id, false);
check("not ticking the wallet keeps the balance", r.status === 201 && (await a.c("/api/v1/wallet")).json.balancePaise === 10100);
await a.c(`/api/v1/orders/${r.json.orderId}/cancel`, { method: "POST", body: {} });
r = await buy(product.variant_id, true);
const orderId = r.json?.orderId;
const [order] = await sql`select wallet_paise, subtotal_paise, discount_paise, shipping_paise, grand_total_paise from orders where id = ${orderId}`;
check("₹50 of the wallet comes off a ₹299+ order", r.status === 201 && order.wallet_paise === 5000 && order.grand_total_paise === order.subtotal_paise - order.discount_paise - 5000 + order.shipping_paise, JSON.stringify(order));
w = (await a.c("/api/v1/wallet")).json;
check("the wallet shows ₹51 left and the order it went on", w.balancePaise === 5100 && w.entries.some((e) => e.kind === "ORDER_SPEND" && e.orderId === orderId && e.amountPaise === -5000));
check("the shopper's order shows the wallet line", (await a.c(`/api/v1/orders/${orderId}`)).json?.order?.walletPaise === 5000 || (await a.c(`/api/v1/orders/${orderId}`)).json?.walletPaise === 5000);
const [item] = await sql`select oi.unit_price_paise * oi.quantity line, oi.seller_id from order_items oi where oi.order_id = ${orderId}`;
check("the seller is still owed their full price (LOIMART pays the wallet)", item.line === order.subtotal_paise);

// --- cancelling gives it back
await sql`update customer_wallet_entries set expires_at = now() + interval '2 days' where customer_id = ${a.customerId} and kind = 'SIGNUP_BONUS'`;
r = await a.c(`/api/v1/orders/${orderId}/cancel`, { method: "POST", body: {} });
w = (await a.c("/api/v1/wallet")).json;
const left = (new Date(w.nextExpiry?.at) - Date.now()) / 86400000;
check("cancelling puts the ₹50 back", r.status === 200 && w.balancePaise === 10100 && w.entries.some((e) => e.kind === "ORDER_REFUND" && e.orderId === orderId), JSON.stringify({ status: r.status, bal: w.balancePaise }));
check("…with at least 7 days to use it", left > 6.9, String(left));
await sql`update customer_wallet_entries set expires_at = now() - interval '1 minute' where customer_id = ${a.customerId} and kind = 'SIGNUP_BONUS'`;
check("expired bonus money can't be used", (await a.c("/api/v1/wallet")).json.balancePaise === 0);
r = await buy(product.variant_id, true);
const [o3] = await sql`select wallet_paise from orders where id = ${r.json?.orderId}`;
check("…not even at checkout", r.status === 201 && o3.wallet_paise === 0);
await a.c(`/api/v1/orders/${r.json.orderId}/cancel`, { method: "POST", body: {} });

// --- Admin
const admin = client(AD, testIp());
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
r = await admin("/api/v1/marketing/wallet");
check("Admin sees bonuses given and blocked attempts with reasons", r.status === 200 && r.json.totals.bonuses >= 4 && r.json.reasons.some((x) => /device/.test(x.reason)) && r.json.claims.some((x) => x.status === "BLOCKED"), JSON.stringify(r.json?.totals));
check("…with mobile numbers masked", r.json.claims.every((x) => x.phone.startsWith("******")));
r = await admin("/api/v1/marketing/wallet", { method: "PUT", body: { ...r.json.settings, bonusPaise: -5 } });
check("nonsense rules are refused", r.status === 400);
r = await admin("/api/v1/marketing/wallet", { method: "PUT", body: { enabled: true, bonusPaise: 5100, maxPerOrderPaise: 2500, minOrderPaise: 19900, expiryDays: 15, maxBonusesPerIpPerDay: 3 } });
const e = await newShopper("E2E Wallet E");
w = (await e.c("/api/v1/wallet")).json;
check("Admin changes the rules and the shop follows (₹51 bonus, ₹25 an order)", r.status === 200 && w.rules.bonusPaise === 5100 && w.rules.maxPerOrderPaise === 2500);
await verify(e);
r = await claim(e, device());
check("…new shoppers get the new amount", r.json?.granted && r.json.amountPaise === 5100);
await admin("/api/v1/marketing/wallet", { method: "PUT", body: { enabled: false, bonusPaise: 5100, maxPerOrderPaise: 2500, minOrderPaise: 19900, expiryDays: 15, maxBonusesPerIpPerDay: 3 } });
const f = await newShopper("E2E Wallet F");
check("switching it off stops new bonuses", (await f.c("/api/v1/wallet")).json?.bonus.state === "OFF");
const shopperOnAdmin = client(AD, testIp());
check("shoppers can't open the Admin wallet page", [401, 403].includes((await shopperOnAdmin("/api/v1/marketing/wallet")).status));

await tidy();
await clearLimits();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
