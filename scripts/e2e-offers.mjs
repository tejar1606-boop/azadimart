// End-to-end test for offer tags: admin tags (product, category and all
// scopes; dates; on/off; priority), automatic "Price drop" tags from admin
// price edits, and coupon offers on product pages. Requires the demo seed +
// catalogue seed and all three apps against a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:offers
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
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
const admin = client(AD), seller = client(SE);
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });

const catalog = async () => (await fetch(`${SF}/api/v1/catalog/products?limit=60`).then((r) => r.json())).items ?? [];
const cardBadge = async (id) => (await catalog()).find((p) => p.id === id)?.badge ?? null;
const page = (slug) => fetch(`${SF}/products/${slug}`).then((r) => r.text());
const iso = (offsetMinutes) => new Date(Date.now() + offsetMinutes * 60000).toISOString();

// Two live products with photos, from different categories that no existing offer tag touches,
// so admin-made tags already in the store can't change what the checks see.
const existingTags = await sql`select scope from offer_tags where is_active and starts_at <= now() and (ends_at is null or ends_at > now())`;
if (existingTags.some((t) => t.scope?.allProducts)) throw new Error("An active store-wide offer tag exists; turn it off before running this test.");
const taggedCats = new Set(existingTags.flatMap((t) => t.scope?.categoryIds ?? []));
const taggedProducts = new Set(existingTags.flatMap((t) => t.scope?.productIds ?? []));
const cats = await sql`select id, parent_id from categories`;
const parentOf = new Map(cats.map((c) => [c.id, c.parent_id]));
const live = (await sql`select p.id, p.slug, p.title, p.category_id from products p where p.status = 'LIVE' and p.title not ilike '%gallardo%' and p.price_dropped_at is null and exists (select 1 from product_media m where m.product_id = p.id) order by p.created_at`)
  .filter((p) => !taggedProducts.has(p.id) && !taggedCats.has(p.category_id) && !taggedCats.has(parentOf.get(p.category_id)));
if (live.length < 2) throw new Error("Need two untagged live products in different categories.");
const a = live[0], b = live.find((p) => p.category_id !== a.category_id);
const created = [];
const createTag = async (body) => { const r = await admin("/api/v1/offer-tags", { method: "POST", body }); if (r.json?.tag?.id) created.push(r.json.tag.id); return r; };

// --- validation and access
let r = await createTag({ label: "This label is far too long for a tag", scope: { productIds: [a.id] } });
check("label longer than 24 characters rejected", r.status === 400, String(r.status));
r = await createTag({ label: "No scope", scope: {} });
check("tag without products rejected", r.status === 400, String(r.status));
r = await createTag({ label: "Backwards", scope: { productIds: [a.id] }, startsAt: iso(60), endsAt: iso(10) });
check("end before start rejected", r.status === 400, String(r.status));
check("sellers can't manage offer tags", [401, 403].includes((await seller(`${AD}/api/v1/offer-tags`)).status));

// --- product tag shows on card and page
r = await createTag({ label: `Deal ${RUN}`, tone: "RED", scope: { productIds: [a.id] }, priority: 5 });
check("admin creates a product tag", r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const productTag = r.json.tag;
let badge = await cardBadge(a.id);
check("card shows the tag", badge?.label === `Deal ${RUN}` && badge.tone === "RED", JSON.stringify(badge));
check("product page shows the tag", (await page(a.slug)).includes(`Deal ${RUN}`));
check("other products unaffected", (await cardBadge(b.id))?.label !== `Deal ${RUN}`);

// --- category tag, priority
r = await createTag({ label: `Cat ${RUN}`, tone: "NAVY", scope: { categoryIds: [b.category_id] }, priority: 1 });
check("category tag reaches products in that category", (await cardBadge(b.id))?.label === `Cat ${RUN}`);
r = await createTag({ label: `Low ${RUN}`, tone: "PINK", scope: { productIds: [a.id] }, priority: 1 });
check("highest priority tag wins on the card", (await cardBadge(a.id))?.label === `Deal ${RUN}`);
check("product page shows every tag", (await page(a.slug)).includes(`Low ${RUN}`));

// --- off / scheduled / ended
await admin(`/api/v1/offer-tags/${productTag.id}`, { method: "PATCH", body: { label: productTag.label, tone: "RED", scope: { productIds: [a.id] }, priority: 5, isActive: false } });
check("turning a tag off hides it", (await cardBadge(a.id))?.label === `Low ${RUN}`);
r = await createTag({ label: `Soon ${RUN}`, scope: { productIds: [b.id] }, priority: 50, startsAt: iso(60) });
check("scheduled tag hidden until it starts", (await cardBadge(b.id))?.label !== `Soon ${RUN}`);
r = await createTag({ label: `Over ${RUN}`, scope: { productIds: [b.id] }, priority: 60, startsAt: iso(-120), endsAt: iso(-60) });
check("ended tag hidden", (await cardBadge(b.id))?.label !== `Over ${RUN}`);
r = await admin("/api/v1/offer-tags");
check("admin lists tags", r.json?.items?.filter((t) => t.label.endsWith(RUN)).length >= 5);

// --- automatic price drop (admin lowers then restores the price)
for (const id of created) await admin(`/api/v1/offer-tags/${id}`, { method: "DELETE" });
const detail = (await admin(`/api/v1/catalog/products/${b.id}`)).json;
const v0 = detail.variants[0];
const body = (price) => ({ title: detail.product.title, description: detail.product.description, categoryId: detail.product.categoryId, metaTitle: detail.product.metaTitle ?? "", metaDescription: detail.product.metaDescription ?? "", variants: detail.variants.map((v, i) => ({ id: v.id, title: v.title, sku: v.sku, pricePaise: i === 0 ? price : v.pricePaise, compareAtPaise: v.compareAtPaise && v.compareAtPaise >= (i === 0 ? price : v.pricePaise) ? v.compareAtPaise : null, weightGrams: v.weightGrams, onHand: v.onHand, isActive: v.isActive })), imageAssetIds: detail.media.filter((m) => m.kind === "IMAGE").map((m) => m.mediaAssetId), videoAssetId: detail.media.find((m) => m.kind === "VIDEO")?.mediaAssetId ?? null });
r = await admin(`/api/v1/catalog/products/${b.id}`, { method: "PATCH", body: body(v0.pricePaise - 10000) });
check("admin lowers the price", r.status === 200, r.status + " " + JSON.stringify(r.json?.error ?? ""));
badge = await cardBadge(b.id);
check("card shows Price drop", badge?.label === "Price drop" && badge.kind === "price_drop", JSON.stringify(badge));
let html = await page(b.slug);
check("product page shows saving", html.includes("Price dropped by") && html.includes("₹100"));
r = await admin("/api/v1/offer-tags");
check("admin sees the price drop", r.json?.priceDrops?.some((d) => d.id === b.id && d.beforePaise === v0.pricePaise));
await admin(`/api/v1/catalog/products/${b.id}`, { method: "PATCH", body: body(v0.pricePaise) });
check("raising the price back removes it", (await cardBadge(b.id)) === null && !(await page(b.slug)).includes("Price dropped by"));

// --- coupon offer on product page
const code = "E2EOFF" + RUN;
r = await admin("/api/v1/coupons", { method: "POST", body: { code, title: "E2E offer", discountType: "PERCENTAGE", discountValue: 15, startsAt: iso(-1), usageLimit: 5, scope: { categoryIds: [a.category_id] } } });
html = await page(a.slug);
check("coupon offer shown on matching product", r.status < 300 && html.includes("Available offers") && html.includes(code) && html.includes("Extra 15% off"), r.status + " " + JSON.stringify(r.json?.error ?? ""));
check("coupon not shown on other categories", !(await page(b.slug)).includes(code));
await sql`update coupons set is_active = false where code = ${code}`;
check("inactive coupon disappears", !(await page(a.slug)).includes(code));

const audits = await sql`select action from audit_logs where action like 'OFFER_TAG_%' and created_at > now() - interval '10 minutes'`;
check("tag changes audited", ["OFFER_TAG_CREATED", "OFFER_TAG_UPDATED", "OFFER_TAG_DELETED"].every((x) => audits.some((y) => y.action === x)));
const left = await sql`select count(*)::int n from offer_tags where label like ${"%" + RUN}`;
check("test tags cleaned up", left[0].n === 0, JSON.stringify(left[0]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
