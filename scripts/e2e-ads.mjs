// End-to-end test for seller ads: admin ad spaces and prices, banner upload,
// ad review, the per-day auction (minimum bid, outbid, raising, book now,
// booked days blocked, closed days), auction close, the Sponsored banner on
// the home page with view/click counting, charges after the day, ad charges
// taken from payouts, withdrawal, alerts and access. Requires the demo seed +
// catalogue seed, an E2E seller (pnpm e2e:seller) and all three apps against
// a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:ads
import { deflateSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const RUN = Date.now().toString(36).slice(-5).toUpperCase();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, raw, contentType, redirect = "follow" } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    if (raw) headers["content-type"] = contentType;
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined), redirect });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, location: res.headers.get("location") };
  };
}
const shop = client(SF), admin = client(AD), sellerA = client(SE), sellerB = client(SE), anon = client(AD);
const [me] = await sql`select s.id, s.store_name, s.payout_hold_reason from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const [rival] = await sql`select s.id, u.email from sellers s join users u on u.id = s.user_id where s.status = 'ACTIVE' and s.id <> ${me.id} and u.email like 'e2e.seller.%' and s.gstin is not null order by s.created_at desc limit 1`;
if (!rival) throw new Error("Run pnpm e2e:seller first (needs an active E2E seller).");
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await sellerA("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
const loginB = await sellerB("/api/auth/login", { method: "POST", body: { email: rival.email, password: PW } });
if (loginB.status !== 200) throw new Error("Rival seller login failed: " + loginB.status);

const stocked = await sql`select v.id variant_id, p.id product_id, p.slug from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved > 8 order by p.created_at limit 2`;
const [mine, lent] = stocked;
// The rival needs a live product of their own: lend one, given back at the end.
await sql`update products set seller_id = ${rival.id} where id = ${lent.product_id}`;
let slotId = null;
const giveBack = async () => {
  await sql`update products set seller_id = ${me.id} where id = ${lent.product_id}`;
  // Remove this run's ad space with its ads and bids (charges keep their history).
  if (slotId) {
    await sql`delete from ad_bids where slot_id = ${slotId}`;
    await sql`delete from ad_campaigns where slot_id = ${slotId}`;
    await sql`delete from ad_slots where id = ${slotId}`;
  }
};
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); giveBack().finally(() => process.exit(1)); });

const istDay = (offset = 0) => new Date(Date.now() + 330 * 60_000 + offset * 864e5).toISOString().slice(0, 10);
const [d1, d2, d3, d4, d5, d6] = [2, 3, 4, 5, 6, 7].map(istDay);
const alerts = async (c, kind) => ((await c("/api/v1/notifications")).json?.items ?? []).filter((n) => n.kind === kind);
const calendar = async (c) => (await c(`/api/v1/ads/slots/${slotId}`)).json?.days ?? [];
const dayOf = async (c, day) => (await calendar(c)).find((d) => d.day === day);
const bid = (c, campaignId, days, mode, amount) => c("/api/v1/ads/bids", { method: "POST", body: { campaignId, days, mode, amountPaise: amount ? amount * 100 : undefined } });

function makePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((1 + width * 3) * height, 200);
  for (let y = 0; y < height; y++) rows[y * (1 + width * 3)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
async function uploadBanner(c, width, height) {
  const bytes = makePng(width, height);
  const ticket = await c("/api/v1/media/uploads", { method: "POST", body: { purpose: "AD_IMAGE", contentType: "image/png", byteSize: bytes.length } });
  if (ticket.status !== 200) return ticket;
  await c(ticket.json.uploadUrl, { method: "PUT", raw: bytes, contentType: "image/png" });
  return c("/api/v1/media/uploads/complete", { method: "POST", body: { token: ticket.json.token } });
}

// --- admin: ad space and prices
const slotBody = { name: `Home banner ${RUN}`, placement: "HOME_HERO", description: "E2E", basePricePaise: 50000, buyNowPricePaise: 200000, bidIncrementPaise: 10000, closeHoursBefore: 1, isActive: true };
let r = await admin("/api/v1/ads/slots", { method: "POST", body: { ...slotBody, buyNowPricePaise: 40000 } });
check("book-now price below starting price rejected", r.status === 400, String(r.status));
r = await admin("/api/v1/ads/slots", { method: "POST", body: slotBody });
slotId = r.json?.slot?.id;
check("admin creates an ad space with prices", r.status === 201 && slotId, r.status + " " + JSON.stringify(r.json?.error ?? ""));
check("sellers can't create ad spaces", [401, 403].includes((await sellerA(`${AD}/api/v1/ads/slots`, { method: "POST", body: slotBody })).status));

// --- seller ads: banner upload, content rules, review
r = await uploadBanner(sellerA, 1440, 540);
const desktopA = r.json?.mediaAssetId;
check("seller uploads an ad banner", r.status === 201 && desktopA, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const mobileA = (await uploadBanner(sellerA, 600, 750)).json?.mediaAssetId;
const desktopB = (await uploadBanner(sellerB, 1440, 540)).json?.mediaAssetId;
r = await sellerA("/api/v1/ads/campaigns", { method: "POST", body: { slotId, productId: lent.product_id, headline: "Not mine", desktopImageAssetId: desktopA } });
check("can't advertise another seller's product", r.status === 400, String(r.status));
r = await sellerA("/api/v1/ads/campaigns", { method: "POST", body: { slotId, productId: mine.product_id, headline: "Not my image", desktopImageAssetId: desktopB } });
check("can't use another seller's image", r.status === 400, String(r.status));
r = await sellerA("/api/v1/ads/campaigns", { method: "POST", body: { slotId, productId: mine.product_id, headline: `Kitchen sale ${RUN}`, desktopImageAssetId: desktopA, mobileImageAssetId: mobileA } });
const campA = r.json?.campaign?.id;
check("seller creates an ad (sent for review)", r.status === 201 && r.json.campaign.status === "PENDING_REVIEW", r.status + " " + JSON.stringify(r.json?.error ?? ""));
const campB = (await sellerB("/api/v1/ads/campaigns", { method: "POST", body: { slotId, productId: lent.product_id, headline: `Rival deal ${RUN}`, desktopImageAssetId: desktopB } })).json?.campaign?.id;

// --- calendar
let cal = await calendar(sellerA);
check("calendar covers 60 days; today can't be bid on", cal.length === 60 && cal[0].day === istDay(0) && cal[0].status === "UNAVAILABLE", JSON.stringify(cal[0]));
check("open day shows starting price and book-now", cal.find((d) => d.day === d1)?.status === "OPEN" && cal.find((d) => d.day === d1).minimumBidPaise === 50000 && cal.find((d) => d.day === d1).buyNowPaise === 200000);

// --- bidding
r = await bid(sellerA, campA, [d1], "BID", 400);
check("bid below the starting price refused", r.status === 409 && /at least ₹500/.test(r.json?.results?.[0]?.reason ?? ""), JSON.stringify(r.json?.results));
r = await bid(sellerA, campA, [d1, d2, d3], "BID", 600);
check("seller bids on 3 days at once", r.status === 200 && r.json.results.every((x) => x.ok && x.status === "ACTIVE"), JSON.stringify(r.json?.results));
r = await bid(sellerB, campB, [d1], "BID", 650);
check("rival must beat the top bid by the step", r.status === 409 && /at least ₹700/.test(r.json?.results?.[0]?.reason ?? ""), JSON.stringify(r.json?.results));
r = await bid(sellerB, campB, [d1], "BID", 700);
check("rival outbids", r.json?.results?.[0]?.ok === true);
check("outbid seller is alerted", (await alerts(sellerA, "AD_OUTBID")).some((n) => n.body.includes(`Home banner ${RUN}`)));
let day1 = await dayOf(sellerA, d1);
check("calendar shows the new top bid and that I was outbid", day1.status === "BIDDING" && day1.topBidPaise === 70000 && day1.mine?.status === "OUTBID" && day1.bidCount === 2, JSON.stringify(day1));
check("other sellers' names are never shown", !JSON.stringify(await calendar(sellerB)).includes(me.store_name));
r = await bid(sellerA, campA, [d2], "BID", 650);
check("top bidder can raise their own bid", r.json?.results?.[0]?.ok && (await dayOf(sellerA, d2)).topBidPaise === 65000);
r = await bid(sellerB, campB, [d3], "BUY_NOW");
check("book now takes the day instantly", r.json?.results?.[0]?.status === "WON" && r.json.results[0].amountPaise === 200000, JSON.stringify(r.json?.results));
check("the beaten bidder is told", (await alerts(sellerA, "AD_LOST")).length >= 1);
check("booked day is blocked for everyone else", (await dayOf(sellerA, d3)).status === "BOOKED" && /Already booked/.test((await bid(sellerA, campA, [d3], "BID", 5000)).json?.results?.[0]?.reason ?? ""));
await bid(sellerA, campA, [d2], "BID", 2500);
r = await bid(sellerB, campB, [d2], "BUY_NOW");
check("no book-now once bids pass the book-now price", /above the book-now price/.test(r.json?.results?.[0]?.reason ?? ""), JSON.stringify(r.json?.results));
check("can't bid more than 60 days ahead", /within the next 60 days/.test((await bid(sellerA, campA, [istDay(70)], "BID", 600)).json?.results?.[0]?.reason ?? ""));

// --- admin closes days
r = await admin(`/api/v1/ads/slots/${slotId}/closed-days`, { method: "POST", body: { days: [d5], closed: true } });
check("admin closes a day", r.status === 200 && (await dayOf(sellerA, d5)).status === "CLOSED");
check("closed day can't be bid on", /Not available/.test((await bid(sellerA, campA, [d5], "BID", 600)).json?.results?.[0]?.reason ?? ""));
check("days with bids can't be closed", (await admin(`/api/v1/ads/slots/${slotId}/closed-days`, { method: "POST", body: { days: [d1], closed: true } })).status === 409);
await admin(`/api/v1/ads/slots/${slotId}/closed-days`, { method: "POST", body: { days: [d5], closed: false } });

// --- bidding closes: highest bid wins
await sql`update ad_slots set close_hours_before = 160 where id = ${slotId}`;
await sellerA("/api/v1/ads");
const won = await sql`select day::text, seller_id, status, amount_paise from ad_bids where slot_id = ${slotId} and status in ('WON', 'LOST') order by day`;
check("when bidding closes the top bid wins each day", won.some((w) => w.day === d1 && w.seller_id === rival.id && w.status === "WON" && w.amount_paise === 70000) && won.some((w) => w.day === d2 && w.seller_id === me.id && w.status === "WON" && w.amount_paise === 250000), JSON.stringify(won));
check("losers marked lost", won.some((w) => w.day === d1 && w.seller_id === me.id && w.status === "LOST"));
check("winner alerted", (await alerts(sellerB, "AD_WON")).length >= 1 && (await alerts(sellerA, "AD_WON")).length >= 1);
await sql`update ad_slots set close_hours_before = 1 where id = ${slotId}`;

// --- review
r = await admin(`/api/v1/ads/campaigns/${campB}`, { method: "POST", body: { decision: "REJECTED" } });
check("rejecting an ad needs a note", r.status === 400);
await admin(`/api/v1/ads/campaigns/${campB}`, { method: "POST", body: { decision: "REJECTED", note: "Banner text too small" } });
check("seller told what to change", (await alerts(sellerB, "AD_REVIEWED")).some((n) => n.body.includes("Banner text too small")));
r = await sellerB(`/api/v1/ads/campaigns/${campB}`, { method: "PUT", body: { slotId, productId: lent.product_id, headline: `Rival deal v2 ${RUN}`, desktopImageAssetId: desktopB } });
check("edited ad goes back to review", r.status === 200 && r.json.campaign.status === "PENDING_REVIEW");
r = await admin(`/api/v1/ads/campaigns/${campA}`, { method: "POST", body: { decision: "APPROVED" } });
check("admin approves an ad", r.status === 200);

// --- live on the home page
const [winA] = await sql`select id from ad_bids where slot_id = ${slotId} and day = ${d2} and status = 'WON'`;
await sql`update ad_bids set day = ${istDay(0)} where id = ${winA.id}`;
let home = await shop("/");
check("today's approved ad shows on the home page as Sponsored", home.text.includes(`/api/v1/ads/click/${winA.id}`) && home.text.includes("Sponsored"), String(home.status));
await sql`update ad_campaigns set status = 'PENDING_REVIEW' where id = ${campA}`;
check("unapproved ads never show", !(await shop("/")).text.includes(winA.id));
await sql`update ad_campaigns set status = 'APPROVED' where id = ${campA}`;
await shop("/api/v1/ads/impression", { method: "POST", body: { bidId: winA.id } });
r = await shop(`/api/v1/ads/click/${winA.id}`, { redirect: "manual" });
const [stats] = await sql`select impressions, clicks from ad_bids where id = ${winA.id}`;
check("views and clicks are counted; click opens the product", stats.impressions === 1 && stats.clicks === 1 && [302, 303, 307].includes(r.status) && r.location?.endsWith(`/products/${mine.slug}`), JSON.stringify({ stats, status: r.status, loc: r.location }));
const sellerView = (await sellerA("/api/v1/ads")).json;
check("seller sees views and clicks", sellerView?.totals?.impressions >= 1 && sellerView.totals.clicks >= 1);

// --- after the day: charge, then taken from the payout
await sql`update ad_bids set day = ${istDay(-1)} where id = ${winA.id}`;
const [winB] = await sql`select id from ad_bids where slot_id = ${slotId} and seller_id = ${rival.id} and day = ${d1} and status = 'WON'`;
await sql`update ad_bids set day = ${istDay(-2)} where id = ${winB.id}`;
await sql`update sellers set payout_hold_reason = null where id = ${me.id}`;
// A delivered Cash on Delivery order 8 days ago, so there's a payout to take the charge from.
for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: mine.variant_id, quantity: 3 } });
const addr = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "9 Brigade Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001", isDefault: true } })).json;
const order = (await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addr?.address?.id ?? addr?.item?.id ?? addr?.id, paymentMethod: "COD" } })).json;
const [shipment] = await sql`insert into shipments (order_id, seller_id, status, awb) values (${order.orderId}, ${me.id}, 'OUT_FOR_DELIVERY', ${"E2EAD" + RUN}) returning id`;
await sellerA(`/api/v1/shipments/${shipment.id}`, { method: "PATCH", body: { status: "DELIVERED" } });
await sql`update orders set delivered_at = now() - interval '8 days' where id = ${order.orderId}`;
r = await admin("/api/cron/payouts", { method: "POST" });
const charges = await sql`select seller_id, amount_paise, status, payout_id from seller_charges where reference_id in (${winA.id}, ${winB.id})`;
check("finished ad day charged to the winner", charges.length === 1 && charges[0].seller_id === me.id && charges[0].amount_paise === 250000, JSON.stringify(charges));
check("no charge when the ad wasn't approved (didn't run)", !charges.some((c) => c.seller_id === rival.id));
const [payout] = await sql`select p.* from payouts p join payout_items pi on pi.payout_id = p.id join order_items oi on oi.id = pi.order_item_id where oi.order_id = ${order.orderId} limit 1`;
check("ad charge taken from the next payout", charges[0]?.status === "SETTLED" && charges[0].payout_id === payout?.id && payout.charges_paise === 250000, JSON.stringify({ charge: charges[0], payout: payout && { amount: payout.amount_paise, charges: payout.charges_paise } }));
check("seller alerted about the charge", (await alerts(sellerA, "AD_CHARGED")).length >= 1);
await admin("/api/cron/payouts", { method: "POST" });
check("never charged twice", (await sql`select count(*)::int n from seller_charges where reference_id = ${winA.id}`)[0].n === 1);
check("payout breakdown lists the ad charge", (await sellerA(`/api/v1/payouts/${payout.id}`)).json?.charges?.[0]?.amountPaise === 250000);

// --- admin withdraws a booking
await bid(sellerA, campA, [d6], "BUY_NOW");
const [b6] = await sql`select id from ad_bids where slot_id = ${slotId} and day = ${d6} and status = 'WON'`;
check("withdrawing needs a reason", (await admin(`/api/v1/ads/bids/${b6.id}`, { method: "DELETE", body: {} })).status === 400);
r = await admin(`/api/v1/ads/bids/${b6.id}`, { method: "DELETE", body: { reason: "Product listing under review" } });
check("admin withdraws a booking; the day opens again", r.status === 200 && (await dayOf(sellerA, d6)).status === "OPEN");

// --- reports and access
const adminView = (await admin("/api/v1/ads/slots")).json;
check("admin sees bookings with seller names", adminView?.bookings?.some((b) => b.storeName === me.store_name));
check("admin calendar shows who booked", (await admin(`/api/v1/ads/slots/${slotId}/calendar`)).json?.days?.some((d) => d.holder));
check("sellers can't approve ads or see the admin calendar", [401, 403].includes((await sellerA(`${AD}/api/v1/ads/campaigns/${campA}`, { method: "POST", body: { decision: "APPROVED" } })).status) && [401, 403].includes((await sellerA(`${AD}/api/v1/ads/slots/${slotId}/calendar`)).status));
check("customers can't bid", [401, 403].includes((await shop(`${SE}/api/v1/ads/bids`, { method: "POST", body: { campaignId: campA, days: [d4], mode: "BID", amountPaise: 99999 } })).status));
check("a seller can't bid with another seller's ad", /Ad not found/.test((await bid(sellerB, campA, [d4], "BID", 900)).json?.results?.[0]?.reason ?? ""));
const audits = await sql`select action from audit_logs where created_at > now() - interval '15 minutes' and action like 'AD_%'`;
check("ad actions audited", ["AD_SLOT_CREATED", "AD_CREATED", "AD_BID", "AD_BOOKED", "AD_APPROVED", "AD_REJECTED", "AD_BOOKING_WITHDRAWN"].every((a) => audits.some((x) => x.action === a)));

// --- tidy up
await giveBack();
await sql`update inventory set on_hand = on_hand + 3 where variant_id = ${mine.variant_id}`;
await sql`update orders set created_at = created_at - interval '1 year', delivered_at = delivered_at - interval '1 year' where id = ${order.orderId}`;
await sql`update sellers set payout_hold_reason = ${me.payout_hold_reason} where id = ${me.id}`;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
