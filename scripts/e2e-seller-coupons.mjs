// End-to-end test for seller coupon limits: a seller sets how much LOIMART
// coupons may take off each product; coupons "paid by sellers" show and apply
// only where allowed, the discount is recorded per order line and comes out of
// the seller's payout (commission and taxes on the lower price), and
// LOIMART-paid coupons are unaffected. Requires the demo seed and all three
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
  // Test coupons are deleted (kept in the background only if an order used them).
  for (const id of couponIds) await admin(`/api/v1/coupons/${id}`, { method: "DELETE" });
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

// --- product pages ("Available offers" box only: cards elsewhere on the page can show other products' coupons)
const offersOf = (html) => { const at = html.indexOf("Available offers"); return at < 0 ? "" : html.slice(at, html.indexOf("</ul>", at)); };
const pageA = offersOf((await shop(`/products/${A.slug}`)).text), pageB = offersOf((await shop(`/products/${B.slug}`)).text);
check("the 10% coupon shows on the product that allows 15%", pageA.includes(c10));
check("the 20% coupon doesn't (above the seller's 15%)", !pageA.includes(c20));
check("neither shows on the product kept out of coupons", !pageB.includes(c10) && !pageB.includes(c20));
check("LOIMART's own coupon still shows there", pageB.includes(cAzm));

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

// --- an LOIMART coupon costs the seller nothing
for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: B.variant_id, quantity: 1 } });
r = await shop("/api/v1/coupons/validate", { method: "POST", body: { cartId: (await shop("/api/v1/cart")).json?.cartId, code: cAzm } });
check("LOIMART's coupon applies even to products kept out of seller coupons", r.status === 200 && r.json.discountPaise === Math.floor(B.price_paise * 5 / 100));

// --- a coupon for one product only (e.g. "only on Gallardo")
const cOne = `E2EONE${RUN}`;
r = await mk({ code: cOne, discountType: "PERCENTAGE", discountValue: 12, fundingType: "SELLER", sellerId: me.id, scope: { productIds: [A.product_id] } });
check("admin creates a coupon for one product, paid by its seller", r.status === 201 && r.json.coupon.appliesTo === `Products: ${A.title}`, JSON.stringify(r.json?.coupon?.appliesTo ?? r.json?.error));
check("…and it's listed with what it applies to", ((await admin("/api/v1/coupons")).json?.coupons ?? []).some((c) => c.code === cOne && c.appliesTo?.includes(A.title)));
const cardsFor = async (title) => (await shop(`/api/v1/catalog/products?limit=50&q=${encodeURIComponent(title)}`)).json?.items ?? [];
check("its product card in listings shows the coupon", (await cardsFor(A.title)).find((x) => x.id === A.product_id)?.coupon?.code === cOne);
check("…but not on other products' cards", (await cardsFor(B.title)).find((x) => x.id === B.product_id)?.coupon?.code !== cOne);
check("its product page offers it; the seller's other product doesn't", offersOf((await shop(`/products/${A.slug}`)).text).includes(cOne) && !offersOf((await shop(`/products/${B.slug}`)).text).includes(cOne));
for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: A.variant_id, quantity: 1 } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: B.variant_id, quantity: 1 } });
r = await shop("/api/v1/coupons/validate", { method: "POST", body: { cartId: (await shop("/api/v1/cart")).json?.cartId, code: cOne } });
check("in the cart it discounts only that product", r.status === 200 && r.json.eligibleSubtotalPaise === A.price_paise && r.json.discountPaise === Math.floor(A.price_paise * 12 / 100), JSON.stringify(r.json));
const [other] = await sql`select p.id from products p where p.seller_id <> ${me.id} and p.status = 'LIVE' limit 1`;
check("a seller's coupon can't include another seller's product", (await mk({ code: `E2EBAD${RUN}`, discountType: "PERCENTAGE", discountValue: 10, fundingType: "SELLER", sellerId: me.id, scope: { productIds: [A.product_id, other.id] } })).status === 400);
r = await mk({ code: `E2EWARN${RUN}`, discountType: "PERCENTAGE", discountValue: 30, fundingType: "SELLERS", scope: { productIds: [A.product_id] } });
check("a seller-paid coupon above the product's limit is created with a clear warning", r.status === 201 && (r.json.warnings ?? []).some((w) => w.includes("up to 15%")), JSON.stringify(r.json?.warnings));

// --- deleting coupons
const cDel = `E2EDEL${RUN}`;
r = await mk({ code: cDel, discountType: "PERCENTAGE", discountValue: 5, fundingType: "AZADIMART" });
const delId = r.json?.coupon?.id;
r = await admin(`/api/v1/coupons/${delId}`, { method: "DELETE" });
check("an unused coupon is deleted for good", r.status === 200 && r.json.result === "DELETED" && (await sql`select count(*)::int n from coupons where id = ${delId}`)[0].n === 0);
const usedId = (await sql`select id from coupons where code = ${c10}`)[0].id;
r = await admin(`/api/v1/coupons/${usedId}`, { method: "DELETE" });
const [usedRow] = await sql`select deleted_at, is_active from coupons where id = ${usedId}`;
check("a used coupon is removed from the list but kept for its orders", r.status === 200 && r.json.result === "ARCHIVED" && r.json.orders >= 1 && usedRow.deleted_at && !usedRow.is_active && !((await admin("/api/v1/coupons")).json?.coupons ?? []).some((c) => c.id === usedId));
check("the order still shows its discount", orderId ? (await sql`select discount_paise from orders where id = ${orderId}`)[0].discount_paise > 0 : true);
await shop("/api/v1/cart", { method: "POST", body: { variantId: A.variant_id, quantity: 1 } });
check("customers can't use a deleted coupon", (await shop("/api/v1/coupons/validate", { method: "POST", body: { cartId: (await shop("/api/v1/cart")).json?.cartId, code: c10 } })).status >= 400);
check("a deleted coupon can't be switched back on", (await admin(`/api/v1/coupons/${usedId}`, { method: "PATCH", body: { isActive: true } })).status === 404);
r = await admin("/api/v1/coupons", { method: "POST", body: { code: c10, title: "Reuse", discountType: "PERCENTAGE", discountValue: 5, startsAt: iso(-1) } });
check("its code can't be reused", r.status === 409 && /deleted coupon/.test(r.json?.error?.message ?? ""));
check("deletes are audited", (await sql`select count(*)::int n from audit_logs where entity_id in (${delId}, ${usedId}) and action in ('COUPON_DELETED', 'COUPON_ARCHIVED')`)[0].n === 2);

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
