// End-to-end test for seller coupon limits: a seller sets how much AzadiMart
// coupons may take off each product; coupons "paid by sellers" show and apply
// only where allowed, the discount is recorded per order line and comes out of
// the seller's payout (commission and taxes on the lower price), and
// AzadiMart-paid coupons are unaffected. Requires the demo seed and all three
// apps against a NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… SELLER_URL=… ADMIN_URL=… pnpm e2e:seller-coupons
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const RUN = Date.now().toString(36).slice(-5).toUpperCase();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
}
const shop = client(SF), seller = client(SE), admin = client(AD);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });

const [me] = await sql`select s.id, s.tax_identity_type from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const stocked = await sql`select p.id product_id, p.slug, p.title, p.coupon_max_discount_pct, v.id variant_id, v.price_paise from products p join product_variants v on v.product_id = p.id join inventory i on i.variant_id = v.id
  where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved > 5 order by p.created_at limit 2`;
if (stocked.length < 2) throw new Error("Need two stocked live products from the demo seller.");
const [A, B] = stocked;
const [foreign] = await sql`select id from products where seller_id <> ${me.id} limit 1`;
const couponIds = [];
let orderId = null;
async function tidy() {
  for (const p of stocked) await sql`update products set coupon_max_discount_pct = ${p.coupon_max_discount_pct} where id = ${p.product_id}`;
  for (const id of couponIds) await sql`update coupons set is_active = false where id = ${id}`;
  if (orderId) {
    await sql`delete from coupon_redemptions where order_id = ${orderId}`;
    const items = await sql`select variant_id, quantity from order_items where order_id = ${orderId}`;
    for (const it of items) await sql`update inventory set reserved = greatest(0, reserved - ${it.quantity}) where variant_id = ${it.variant_id}`;
    await sql`update orders set status = 'CANCELLED', cancelled_at = now(), cancellation_reason = 'E2E clean-up' where id = ${orderId}`;
    await sql`update payments set status = 'FAILED' where order_id = ${orderId}`;
  }
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

// --- seller sets the limit per product
let r = await seller(`/api/v1/products/${A.product_id}/coupon-limit`, { method: "PUT", body: { couponMaxDiscountPct: 15 } });
check("seller allows coupons up to 15% on a product", r.status === 200 && (await sql`select coupon_max_discount_pct n from products where id = ${A.product_id}`)[0].n === 15);
await seller(`/api/v1/products/${B.product_id}/coupon-limit`, { method: "PUT", body: { couponMaxDiscountPct: 0 } });
check("…and keeps another out of coupons", (await sql`select coupon_max_discount_pct n from products where id = ${B.product_id}`)[0].n === 0);
check("limits above 90% are refused", (await seller(`/api/v1/products/${A.product_id}/coupon-limit`, { method: "PUT", body: { couponMaxDiscountPct: 95 } })).status === 400);
check("a seller can't change another seller's product", (await seller(`/api/v1/products/${foreign.id}/coupon-limit`, { method: "PUT", body: { couponMaxDiscountPct: 50 } })).status === 404);
check("seller's product list shows the limit", ((await seller("/api/v1/products")).json?.products ?? []).find((p) => p.id === A.product_id)?.couponMaxDiscountPct === 15);
check("changes are audited", (await sql`select count(*)::int n from audit_logs where entity_id = ${A.product_id} and action = 'PRODUCT_COUPON_LIMIT_SET'`)[0].n >= 1);

// --- admin creates coupons paid by sellers
const iso = (m) => new Date(Date.now() + m * 60_000).toISOString();
const mk = async (body) => { const res = await admin("/api/v1/coupons", { method: "POST", body: { title: "E2E seller coupon", startsAt: iso(-1), usageLimit: 20, ...body } }); const id = res.json?.coupon?.id ?? res.json?.item?.id ?? res.json?.id; if (id) couponIds.push(id); return res; };
check("a coupon paid by sellers can't name one seller", (await mk({ code: `E2EX${RUN}`, discountType: "PERCENTAGE", discountValue: 10, fundingType: "SELLERS", sellerId: me.id })).status === 400);
check("…or be free shipping", (await mk({ code: `E2EY${RUN}`, discountType: "FREE_SHIPPING", discountValue: 0, fundingType: "SELLERS" })).status === 400);
const c10 = `E2ES10${RUN}`, c20 = `E2ES20${RUN}`, cAzm = `E2EAZ${RUN}`;
r = await mk({ code: c10, discountType: "PERCENTAGE", discountValue: 10, fundingType: "SELLERS" });
check("admin creates a 10% coupon paid by sellers", r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
await mk({ code: c20, discountType: "PERCENTAGE", discountValue: 20, fundingType: "SELLERS" });
await mk({ code: cAzm, discountType: "PERCENTAGE", discountValue: 5, fundingType: "AZADIMART", scope: { productIds: [B.product_id] } });

// --- product pages
const pageA = (await shop(`/products/${A.slug}`)).text, pageB = (await shop(`/products/${B.slug}`)).text;
check("the 10% coupon shows on the product that allows 15%", pageA.includes(c10));
check("the 20% coupon doesn't (above the seller's 15%)", !pageA.includes(c20));
check("neither shows on the product kept out of coupons", !pageB.includes(c10) && !pageB.includes(c20));
check("AzadiMart's own coupon still shows there", pageB.includes(cAzm));

// --- cart
for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: A.variant_id, quantity: 1 } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: B.variant_id, quantity: 1 } });
const cartId = (await shop("/api/v1/cart")).json?.cartId;
r = await shop("/api/v1/coupons/validate", { method: "POST", body: { cartId, code: c10 } });
check("in the cart, 10% comes off only the allowed product", r.status === 200 && r.json.discountPaise === Math.floor(A.price_paise * 10 / 100) && r.json.eligibleSubtotalPaise === A.price_paise, JSON.stringify(r.json));
r = await shop("/api/v1/coupons/validate", { method: "POST", body: { cartId, code: c20 } });
check("a coupon above every seller's limit isn't available", r.status >= 400 && /isn't available/.test(r.json?.error?.message ?? ""), JSON.stringify(r.json?.error));

// --- checkout records the seller's share per line
const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001", isDefault: false } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
r = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD", couponCode: c10 } });
orderId = r.json?.orderId ?? null;
const discountA = Math.floor(A.price_paise * 10 / 100);
check("checkout applies the same discount", r.status === 201 && r.json.discountPaise === discountA, r.status + " " + JSON.stringify(r.json?.error ?? r.json?.discountPaise));
const lines = orderId ? await sql`select product_id, seller_discount_paise from order_items where order_id = ${orderId}` : [];
check("the seller's share is recorded on that product's line only", lines.find((l) => l.product_id === A.product_id)?.seller_discount_paise === discountA && lines.find((l) => l.product_id === B.product_id)?.seller_discount_paise === 0);

// --- payout: the coupon share comes off; commission and taxes on the lower price
if (orderId) {
  await sql`update orders set status = 'DELIVERED', delivered_at = now() - interval '8 days' where id = ${orderId}`;
  await sql`update payments set status = 'CAPTURED' where order_id = ${orderId}`;
}
const up = ((await seller("/api/v1/payouts")).json?.upcoming ?? []).find((l) => l.orderNumber && l.title === A.title && l.sellerDiscountPaise === discountA);
const sold = A.price_paise - discountA;
const fees = (up?.commissionPaise ?? 0) + (up?.gstOnCommissionPaise ?? 0) + (up?.tcsPaise ?? 0) + (up?.tdsPaise ?? 0);
check("the seller's payout shows the coupon share and pays the price after it", up && up.grossPaise === A.price_paise && up.netPaise === sold - fees && up.tdsPaise === Math.round(sold * 10 / 10_000), JSON.stringify(up));
const upB = ((await seller("/api/v1/payouts")).json?.upcoming ?? []).find((l) => l.title === B.title && l.grossPaise === B.price_paise && l.sellerDiscountPaise === 0);
check("the product outside coupons is paid in full", Boolean(upB));

// --- an AzadiMart coupon costs the seller nothing
for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: B.variant_id, quantity: 1 } });
r = await shop("/api/v1/coupons/validate", { method: "POST", body: { cartId: (await shop("/api/v1/cart")).json?.cartId, code: cAzm } });
check("AzadiMart's coupon applies even to products kept out of seller coupons", r.status === 200 && r.json.discountPaise === Math.floor(B.price_paise * 5 / 100));

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
