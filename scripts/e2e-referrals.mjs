// End-to-end test for seller referrals: every seller gets a code and link;
// a new seller signs up with it; when the referred seller (approved) has
// their first order delivered. The reward (3 more commission-free months) is
// paused while LOIMART charges sellers 0% commission.
// Requires the demo seed + catalogue seed and all three apps against a
// NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:referrals
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'checkout:%' or key like 'register:%'`;
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
const referrer = client(SE), admin = client(AD), shop = client(SF);
await referrer("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });

const [me] = await sql`select s.id, s.gstin, s.approved_at from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const before = await sql`select id from seller_commission_free_periods where seller_id = ${me.id}`;
const [product] = await sql`select v.id variant_id, p.id product_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 3 order by p.created_at desc limit 1`;
if (!product) throw new Error("Need a stocked live product from the demo seller.");
const orders = [];
let lentTo = null;
async function tidy() {
  if (lentTo) await sql`update products set seller_id = ${me.id} where id = ${product.product_id}`;
  for (const id of orders) await sql`update orders set status = 'CANCELLED' where id = ${id}`;
  await sql`delete from seller_commission_free_periods where seller_id = ${me.id} and id <> all(${before.map((b) => b.id)}::uuid[])`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

// --- the referrer's code and link
let r = await referrer("/api/v1/referrals");
const code = r.json?.code;
check("every seller gets a referral code and link", r.status === 200 && /^LOI[A-Z2-9]{6}$/.test(code ?? "") && r.json.link.endsWith(`/register?ref=${code}`), JSON.stringify(r.json && { code, link: r.json.link }));
const again = (await referrer("/api/v1/referrals")).json?.code;
check("the code stays the same", again === code);
const freeBefore = r.json.freeUntil ? new Date(r.json.freeUntil) : null;

// --- a new seller signs up with the code
const rnd = () => Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");
const newSeller = async (gstin, referralCode) => {
  const c = client(SE);
  const email = `e2e.referred.${Date.now()}.${rnd()}@azadimart.test`.toLowerCase();
  const res = await c("/api/auth/register", { method: "POST", body: { storeName: `E2E Referred ${rnd()}`, legalName: "E2E Referred Pvt Ltd", email, phone: "9" + String(Date.now()).slice(-9), businessState: "Karnataka", taxIdentityType: "GSTIN", gstin, taxDeclarationAccepted: true, password: PW, referralCode } });
  return { res, sellerId: res.json?.sellerId };
};
const gstinFor = () => `29${rnd()}${String(1000 + Math.floor(Math.random() * 8999))}A1Z5`;
r = (await newSeller(gstinFor(), "LOIBADBAD")).res;
check("an unknown referral code is refused", r.status === 400 && /referral code/i.test(r.json?.error?.message ?? ""), r.json?.error?.message);
const b = await newSeller(gstinFor(), code.toLowerCase());
const [bRow] = await sql`select referred_by_seller_id from sellers where id = ${b.sellerId}`;
check("a new seller signs up with the code (any case)", b.res.status === 201 && bRow?.referred_by_seller_id === me.id, String(b.res.status));
r = await referrer("/api/v1/referrals");
check("referrer sees them as waiting for approval", r.json?.referrals?.some((x) => x.stage === "SIGNED_UP"));

// Approve the new seller and give them an order (a lent product), then deliver it.
await sql`update sellers set status = 'ACTIVE', approved_at = now() where id = ${b.sellerId}`;
check("referrer sees them approved, waiting for first delivery", (await referrer("/api/v1/referrals")).json?.referrals?.some((x) => x.stage === "APPROVED"));
async function deliverFor(sellerId) {
  await sql`update products set seller_id = ${sellerId} where id = ${product.product_id}`;
  lentTo = sellerId;
  const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "7 Park Street", city: "Kolkata", state: "West Bengal", postalCode: "700016", isDefault: true } })).json;
  const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity: 1 } });
  const o = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
  if (!o.json?.orderId) throw new Error("Checkout failed: " + o.status + " " + JSON.stringify(o.json));
  orders.push(o.json.orderId);
  const [shipment] = await sql`insert into shipments (order_id, seller_id, status, shipped_by, awb) values (${o.json.orderId}, ${sellerId}, 'OUT_FOR_DELIVERY', 'LOIMART', ${"E2EREF" + Date.now()}) returning id`;
  const res = await admin(`/api/v1/shipments/${shipment.id}`, { method: "PATCH", body: { status: "DELIVERED" } });
  await sql`update products set seller_id = ${me.id} where id = ${product.product_id}`;
  lentTo = null;
  return res;
}
// Commission is 0% for every seller, so referral rewards (free months) are paused.
r = await deliverFor(b.sellerId);
const periods = await sql`select 1 from seller_commission_free_periods where seller_id = ${me.id} and referred_seller_id = ${b.sellerId}`;
check("delivery works; no free months are given while commission is 0%", r.status === 200 && periods.length === 0, String(r.status));
const [alert] = await sql`select title from seller_notifications where seller_id = ${me.id} and dedupe_key = ${"REFERRAL_REWARD:" + b.sellerId}`;
check("…and no 'free months' alert promising something worthless", !alert);

// (Commission inside a bonus period is covered by the settlement unit tests in packages/shared.)

// The same business (same GSTIN) can't earn a referral from itself.
const c = await newSeller(me.gstin ?? gstinFor(), code);
if (c.sellerId && me.gstin) {
  await sql`update sellers set status = 'ACTIVE', approved_at = now() where id = ${c.sellerId}`;
  await deliverFor(c.sellerId);
  const self = await sql`select count(*)::int n from seller_commission_free_periods where referred_seller_id = ${c.sellerId}`;
  r = await referrer("/api/v1/referrals");
  check("a referral of your own business doesn't count", self[0].n === 0 && r.json.referrals.some((x) => x.stage === "NOT_COUNTED"));
} else check("a referral of your own business doesn't count", c.res.status === 409 || !me.gstin, "skipped: " + c.res.status);
check("customers can't see referral details", [401, 403].includes((await shop(`${SE}/api/v1/referrals`)).status));

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
