// End-to-end test for shopper Refer & earn: the referral code unlocks only
// after the shopper's own order; a friend who signs up with it and keeps their
// first delivered order past the return window (no return or replacement)
// earns the inviter the reward (₹101) once, paid by the daily job; the friend
// can then invite their own friends (and so on); second accounts on the same
// device and the Admin limit get nothing, with the reason shown.
// Requires the demo seed + catalogue seed and the apps (test server, console
// SMS) against a NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… ADMIN_URL=… pnpm e2e:customer-referrals
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
const device = () => ({ deviceId: randomBytes(16).toString("hex"), fingerprint: randomBytes(32).toString("hex") });
const freePhone = async () => { for (;;) { const p = "6" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"); if (!(await sql`select 1 from users where phone = ${p}`).length) return p; } };
const users = [], orders = [];
let delivered = 0, savedSettings;

const [product] = await sql`select v.id variant_id, p.seller_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  join sellers sl on sl.id = p.seller_id join users su on su.id = sl.user_id
  where su.email = 'demo.seller@azadimart.test' and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 10 and v.price_paise between 40000 and 200000 order by p.created_at desc limit 1`;
if (!product) throw new Error("Need a stocked live demo-seller product between ₹400 and ₹2,000.");

async function tidy() {
  if (orders.length) {
    await sql`delete from return_items where return_id in (select id from returns where order_id = any(${orders}::uuid[]))`;
    await sql`delete from returns where order_id = any(${orders}::uuid[])`;
  }
  for (const id of orders) await sql`update orders set status = 'CANCELLED' where id = ${id} and status <> 'CANCELLED'`;
  if (delivered) await sql`update inventory set on_hand = on_hand + ${delivered} where variant_id = ${product.variant_id}`;
  await sql`delete from platform_settings where key = 'customer_wallet'`;
  if (savedSettings) await sql`insert into platform_settings (key, value) values ('customer_wallet', ${JSON.stringify(savedSettings)}::jsonb)`;
  for (const email of users) await sql`update users set status = 'DISABLED' where email = ${email}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });
savedSettings = (await sql`select value from platform_settings where key = 'customer_wallet'`)[0]?.value;
await sql`delete from platform_settings where key = 'customer_wallet'`; // run on the default rules

async function signUp(name, referralCode) {
  const c = client(SF, testIp());
  const email = `e2e.refer.${RUN}.${users.length}@loimart.test`;
  const phone = await freePhone();
  const r = await c("/api/auth/register", { method: "POST", body: { fullName: name, email, phone, password: PW, referralCode } });
  if (r.status !== 201) return { status: r.status, json: r.json };
  users.push(email);
  await c("/api/auth/login", { method: "POST", body: { email, password: PW } });
  const address = (await c("/api/v1/addresses", { method: "POST", body: { line1: "12 MG Road", city: "Pune", state: "Maharashtra", postalCode: "411001", isDefault: true } })).json;
  return { status: 201, c, email, phone, customerId: r.json.customerId, addressId: address?.address?.id ?? address?.item?.id ?? address?.id };
}
async function welcomeBonus(s, signals) {
  await sql`update login_otps set created_at = now() - interval '5 minutes' where phone = ${s.phone}`;
  const sent = await s.c("/api/v1/wallet/verify-phone", { method: "POST", body: {} });
  await s.c("/api/v1/wallet/verify-phone", { method: "POST", body: { code: sent.json?.devCode } });
  return (await s.c("/api/v1/wallet/claim", { method: "POST", body: signals })).json;
}
async function order(s) {
  for (const item of (await s.c("/api/v1/cart")).json?.items ?? []) await s.c("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await s.c("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity: 1 } });
  const o = await s.c("/api/v1/checkout", { method: "POST", body: { shippingAddressId: s.addressId, paymentMethod: "COD", useWallet: false } });
  if (!o.json?.orderId) throw new Error("Checkout failed: " + o.status + " " + JSON.stringify(o.json));
  orders.push(o.json.orderId);
  return o.json.orderId;
}
const admin = client(AD, testIp());
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
async function deliver(orderId) {
  const [s] = await sql`insert into shipments (order_id, seller_id, status, shipped_by, shipping_fee_paise, awb) values (${orderId}, ${product.seller_id}, 'OUT_FOR_DELIVERY', 'LOIMART', 0, ${"E2EREF" + Date.now() + Math.floor(Math.random() * 1000)}) returning id`;
  const d = await admin(`/api/v1/shipments/${s.id}`, { method: "PATCH", body: { status: "DELIVERED" } });
  if (d.status !== 200) throw new Error("Delivery failed: " + JSON.stringify(d.json));
  delivered++;
}
// The return window closes (as if 8 days passed) and the daily job runs.
async function windowCloses(orderId) {
  await sql`update orders set delivered_at = now() - interval '8 days' where id = ${orderId}`;
  return admin("/api/cron/referral-rewards", { method: "POST" });
}
async function deliverAndKeep(orderId) { await deliver(orderId); return windowCloses(orderId); }
const refer = (s) => s.c("/api/v1/wallet/referrals").then((r) => r.json);
const balance = (s) => s.c("/api/v1/wallet").then((r) => r.json.balancePaise);

// --- the code unlocks with the shopper's own first order
const a = await signUp("E2E Refer Asha");
await welcomeBonus(a, device());
let ra = await refer(a);
check("a new shopper sees Refer & earn locked until their first order", ra?.enabled && !ra.unlocked && ra.code === null && ra.rewardPaise === 10100, JSON.stringify(ra));
let r = await signUp("E2E Refer Nobody", "LMNOSUCH");
check("a wrong referral code is refused at sign-up", r.status === 422, String(r.status));
const cancelled = await order(a);
await a.c(`/api/v1/orders/${cancelled}/cancel`, { method: "POST", body: {} });
check("a cancelled order doesn't unlock it", !(await refer(a)).unlocked);
await order(a);
ra = await refer(a);
check("after an order the shopper gets a referral code", ra.unlocked && /^LM[A-Z2-9]{6}$/.test(ra.code ?? ""), ra.code);

// --- a friend signs up with it; the inviter is paid when the friend's first order is delivered
const b = await signUp("E2E Refer Bala", ra.code.toLowerCase());
check("a friend signs up with the code (any case)", b.status === 201 && (await sql`select referred_by_customer_id r from customers where id = ${b.customerId}`)[0]?.r === a.customerId);
await welcomeBonus(b, device());
check("the friend is listed as signed up", (await refer(a)).friends.some((f) => f.name === "E2E" && f.state === "JOINED"), JSON.stringify((await refer(a)).friends));
const before = await balance(a);
const bOrder = await order(b);
check("the friend has ordered: still no reward until delivery", (await balance(a)) === before && (await refer(a)).friends[0]?.state === "ORDERED");
await deliver(bOrder);
let rf = (await refer(a)).friends[0];
check("delivered, but no reward while the friend can still return it", (await balance(a)) === before && rf?.state === "DELIVERED" && rf.dueAt && (new Date(rf.dueAt) - Date.now()) / 86400000 > 6.9, JSON.stringify(rf));
r = await admin("/api/cron/referral-rewards", { method: "POST" });
check("…the daily job doesn't pay it early", r.status === 200 && (await balance(a)) === before, JSON.stringify(r.json));
r = await windowCloses(bOrder);
let w = (await a.c("/api/v1/wallet")).json;
check("return window over with no return: ₹101 lands in the inviter's wallet", r.json?.granted >= 1 && w.balancePaise === before + 10100 && w.entries.some((e) => e.kind === "REFERRAL_REWARD" && e.amountPaise === 10100), String(w.balancePaise - before));
ra = await refer(a);
check("…and Refer & earn shows the friend rewarded and ₹101 earned", ra.friends[0]?.state === "REWARDED" && ra.earnedPaise === 10100);
await deliverAndKeep(await order(b));
check("the friend's second order pays nothing more", (await balance(a)) === before + 10100);
check("a shopper can't run the daily job", [401, 403].includes((await a.c(`${AD}/api/cron/referral-rewards`, { method: "POST" })).status));

// --- the same for everyone: the friend now invites their own friend
const rb = await refer(b);
check("the friend's own code is unlocked by their order", rb.unlocked && rb.code !== ra.code);
const c = await signUp("E2E Refer Chitra", rb.code);
await welcomeBonus(c, device());
await deliverAndKeep(await order(c));
check("the friend's friend's first delivery pays the friend ₹101", (await balance(b)) === 10100 + 10100, String(await balance(b)));
check("…and nothing extra to the first shopper", (await balance(a)) === before + 10100);

// --- a return or replacement request means no reward for that order
const g = await signUp("E2E Refer Gopi", rb.code);
await welcomeBonus(g, device());
const gOrder = await order(g);
await deliver(gOrder);
const [line] = await sql`select id from order_items where order_id = ${gOrder}`;
r = await g.c(`/api/v1/orders/${gOrder}/returns`, { method: "POST", body: { items: [{ orderItemId: line.id, quantity: 1, reason: "Wrong size, want a replacement" }], reason: "Wrong size" } });
await windowCloses(gOrder);
let gf = (await refer(b)).friends.find((f) => f.state !== "REWARDED");
check("the friend asked for a return/replacement: no reward, even after the window", r.status < 300 && (await balance(b)) === 20200 && gf?.state === "RETURNED", JSON.stringify({ status: r.status, err: r.json?.error, gf }));
await deliverAndKeep(await order(g));
check("…their next order they keep earns it", (await balance(b)) === 30300, String(await balance(b)));

// --- abuse: a second account on the inviter's own phone
const devB = device();
await sql`update signup_bonus_claims set device_id = ${devB.deviceId}, fingerprint = ${devB.fingerprint} where customer_id = ${b.customerId}`;
const fake = await signUp("E2E Refer Second Phone", rb.code);
const bonus = await welcomeBonus(fake, devB);
await deliverAndKeep(await order(fake));
const rb2 = await refer(b);
check("an account on the inviter's own device earns nothing", bonus?.granted === false && (await balance(b)) === 30300 && rb2.friends.some((f) => f.state === "NOT_ELIGIBLE" && /device/.test(f.reason ?? "")), JSON.stringify(rb2.friends));

// --- Admin
r = await admin("/api/v1/marketing/wallet");
const settings = r.json?.settings;
check("Admin sees referral rewards and refused ones with why", r.status === 200 && r.json.totals.referralRewards >= 2 && r.json.referrals.some((x) => x.status === "GRANTED") && r.json.referrals.some((x) => x.status === "BLOCKED"), JSON.stringify(r.json?.totals));
r = await admin("/api/v1/marketing/wallet", { method: "PUT", body: { ...settings, maxReferralRewards: 1 } });
const d = await signUp("E2E Refer Deepa", ra.code);
await welcomeBonus(d, device());
await deliverAndKeep(await order(d));
check("Admin's limit (1 per shopper) stops further rewards", r.status === 200 && (await balance(a)) === before + 10100 && (await refer(a)).friends.some((f) => f.state === "NOT_ELIGIBLE" && /limit/.test(f.reason ?? "")));
r = await admin("/api/v1/marketing/wallet", { method: "PUT", body: { ...settings, referralRewardPaise: 5100 } });
const e = await signUp("E2E Refer Esha", rb.code);
await welcomeBonus(e, device());
await deliverAndKeep(await order(e));
check("Admin changes the reward (₹51) and new rewards follow", r.status === 200 && (await balance(b)) === 30300 + 5100, String(await balance(b)));
await admin("/api/v1/marketing/wallet", { method: "PUT", body: { ...settings, referralEnabled: false } });
check("switching referrals off hides Refer & earn", (await refer(a)).enabled === false);
check("shoppers can't change the rules", [401, 403].includes((await a.c(`${AD}/api/v1/marketing/wallet`, { method: "PUT", body: settings })).status));

await tidy();
await clearLimits();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
