// End-to-end test for seller referrals: every seller gets a code and link;
// a new seller signs up with it; when the referred seller (approved) has
// their first order delivered, the referrer earns a free ad day (one product,
// one open day nobody bid on, not a festival day, approved ad; never charged;
// once per referred seller, never for the same business).
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
const orders = [], newSellers = [];
let lentTo = null, slotId = null;
const festivalBefore = (await sql`select value from platform_settings where key = 'ad_festival_days'`)[0]?.value;
async function tidy() {
  if (slotId) {
    await sql`delete from seller_charges where kind = 'AD' and reference_id in (select id from ad_bids where slot_id = ${slotId})`;
    await sql`update seller_ad_credits set bid_id = null where bid_id in (select id from ad_bids where slot_id = ${slotId})`;
    await sql`delete from ad_bids where slot_id = ${slotId}`;
    await sql`delete from ad_campaigns where slot_id = ${slotId}`;
    await sql`delete from ad_slots where id = ${slotId}`;
  }
  if (newSellers.length) await sql`delete from seller_ad_credits where referred_seller_id = any(${newSellers}::uuid[])`;
  await sql`delete from platform_settings where key = 'ad_festival_days'`;
  if (festivalBefore) await sql`insert into platform_settings (key, value) values ('ad_festival_days', ${JSON.stringify(festivalBefore)}::jsonb)`;
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
// --- the reward: a free ad day
newSellers.push(b.sellerId);
const freeBefore2 = (await referrer("/api/v1/ads")).json?.freeAdDays?.available ?? 0;
r = await deliverFor(b.sellerId);
const credits = await sql`select status from seller_ad_credits where seller_id = ${me.id} and referred_seller_id = ${b.sellerId}`;
check("first delivery earns the referrer one free ad day", r.status === 200 && credits.length === 1 && credits[0].status === "AVAILABLE", String(r.status));
const [alert] = await sql`select title from seller_notifications where seller_id = ${me.id} and dedupe_key = ${"REFERRAL_REWARD:" + b.sellerId}`;
check("referrer gets an alert", /free ad day/.test(alert?.title ?? ""), alert?.title);
r = await referrer("/api/v1/referrals");
check("Refer & earn shows it earned and ready to use", r.json?.earned >= 1 && r.json.available >= 1 && r.json.referrals.some((x) => x.stage === "REWARDED" && !x.used));
await deliverFor(b.sellerId);
check("a second delivery doesn't reward again", (await sql`select count(*)::int n from seller_ad_credits where referred_seller_id = ${b.sellerId}`)[0].n === 1);

// --- using it: one product, one open day, not a festival day, approved ad, never charged
const ist = (d) => new Date(Date.now() + 330 * 60_000 + d * 864e5).toISOString().slice(0, 10);
const [slot] = await sql`insert into ad_slots (name, placement, base_price_paise, bid_increment_paise, close_hours_before) values ('E2E free day slot', 'SEARCH_TOP', 50000, 5000, 12) returning id`;
slotId = slot.id;
const [camp] = await sql`insert into ad_campaigns (seller_id, slot_id, product_id, headline, status) values (${me.id}, ${slotId}, ${product.product_id}, 'E2E free ad', 'PENDING_REVIEW') returning id`;
const useFree = (day) => referrer("/api/v1/ads/bids", { method: "POST", body: { campaignId: camp.id, days: [day], mode: "FREE" } });
const why = (x) => x.json?.results?.[0]?.reason ?? x.json?.error?.message ?? "";
r = await useFree(ist(5));
check("not before LOIMART approves the ad", r.status === 409 && /approved/.test(why(r)), why(r));
await sql`update ad_campaigns set status = 'APPROVED' where id = ${camp.id}`;
await sql`insert into platform_settings (key, value) values ('ad_festival_days', ${JSON.stringify({ days: [ist(6)] })}::jsonb) on conflict (key) do update set value = excluded.value`;
const cal = (await referrer(`/api/v1/ads/slots/${slotId}`)).json?.days ?? [];
check("the calendar marks festival days", cal.find((d) => d.day === ist(6))?.festival === true && cal.find((d) => d.day === ist(5))?.festival === false);
r = await useFree(ist(6));
check("not on a festival or sale day", r.status === 409 && /festival/.test(why(r)), why(r));
await sql`insert into ad_bids (slot_id, campaign_id, seller_id, day, amount_paise, kind, status) values (${slotId}, ${camp.id}, ${me.id}, ${ist(7)}, 50000, 'BID', 'ACTIVE')`;
r = await useFree(ist(7));
check("not on a day that already has bids", r.status === 409 && /bids/.test(why(r)), why(r));
r = await referrer("/api/v1/ads/bids", { method: "POST", body: { campaignId: camp.id, days: [ist(8), ist(9)], mode: "FREE" } });
check("only one day at a time", r.status === 400);
r = await useFree(ist(8));
const [freeBid] = await sql`select id, kind, amount_paise, status from ad_bids where slot_id = ${slotId} and day = ${ist(8)}`;
check("an open day is booked free with the credit", r.status === 200 && r.json.results[0].ok && freeBid?.kind === "FREE" && freeBid.amount_paise === 0 && freeBid.status === "WON", JSON.stringify(r.json));
check("…the credit is used and the Ads page shows one less", (await sql`select status from seller_ad_credits where bid_id = ${freeBid?.id}`)[0]?.status === "USED" && (await referrer("/api/v1/ads")).json?.freeAdDays?.available === freeBefore2);
if (freeBefore2 === 0) { r = await useFree(ist(10)); check("with none left, it's refused", r.status === 409 && /no free ad days/.test(why(r)), why(r)); }
await sql`update ad_bids set day = ${ist(-1)} where id = ${freeBid.id}`;
await admin("/api/cron/payouts", { method: "POST" });
check("the free day is never charged", !(await sql`select 1 from seller_charges where kind = 'AD' and reference_id = ${freeBid.id}`).length);

// (Commission inside a bonus period is covered by the settlement unit tests in packages/shared.)

// The same business (same GSTIN) can't earn a referral from itself.
const c = await newSeller(me.gstin ?? gstinFor(), code);
if (c.sellerId) newSellers.push(c.sellerId);
if (c.sellerId && me.gstin) {
  await sql`update sellers set status = 'ACTIVE', approved_at = now() where id = ${c.sellerId}`;
  await deliverFor(c.sellerId);
  const self = await sql`select count(*)::int n from seller_ad_credits where referred_seller_id = ${c.sellerId}`;
  r = await referrer("/api/v1/referrals");
  check("a referral of your own business doesn't count", self[0].n === 0 && r.json.referrals.some((x) => x.stage === "NOT_COUNTED"));
} else check("a referral of your own business doesn't count", c.res.status === 409 || !me.gstin, "skipped: " + c.res.status);
check("customers can't see referral details", [401, 403].includes((await shop(`${SE}/api/v1/referrals`)).status));

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
