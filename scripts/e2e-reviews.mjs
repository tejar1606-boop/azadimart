// End-to-end test for product reviews: only verified buyers (delivered
// orders) can review; photos; edit and delete; star totals on product and
// cards; seller replies (own products only); admin hide/publish with reasons;
// structured data for Google; imported reviews (proof, approval, label, pin). Requires the demo seed + catalogue seed and all
// three apps running against a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:reviews
import { deflateSync } from "node:zlib";
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
// Suites run back to back as the same demo shopper; start each with a fresh checkout allowance.
await sql`delete from rate_limit_buckets where key like 'checkout:%'`;
const RUN = Date.now().toString(36);
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, raw, contentType } = {}) => {
    const headers = { cookie };
    if (body) headers["content-type"] = "application/json";
    if (raw && contentType) headers["content-type"] = contentType;
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}
function png(width, height) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = Buffer.alloc((1 + width * 3) * height, 150); for (let y = 0; y < height; y++) rows[y * (1 + width * 3)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}
const html = (path) => fetch(SF + path).then((r) => r.text());
const ld = (page) => [...page.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].flatMap((m) => [JSON.parse(m[1])].flat());

const shop = client(SF), seller = client(SE), admin = client(AD), otherSeller = client(SE);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
const [e2eSeller] = await sql`select u.email from users u join sellers s on s.user_id = u.id where u.email like 'e2e.seller.%' and s.status = 'ACTIVE' order by u.created_at desc limit 1`;
if (e2eSeller) await otherSeller("/api/auth/login", { method: "POST", body: { email: e2eSeller.email, password: PW } });

// A live, in-stock product of the demo seller that the demo customer has NOT received yet, so earlier
// orders or reviews can't affect the checks.
const [cust] = await sql`select c.id from customers c join users u on u.id = c.user_id where u.email = 'demo.customer@azadimart.test'`;
const [target] = await sql`select p.id, p.slug, p.title, v.id variant_id from products p
  join product_variants v on v.product_id = p.id and v.is_active
  join inventory i on i.variant_id = v.id
  join sellers s on s.id = p.seller_id join users su on su.id = s.user_id
  where p.status = 'LIVE' and su.email = 'demo.seller@azadimart.test' and i.on_hand - i.reserved > 2 and v.sku <> 'DEMO-KITCHEN-001'
    and not exists (select 1 from order_items oi join orders o on o.id = oi.order_id where oi.product_id = p.id and o.customer_id = ${cust.id} and o.status = 'DELIVERED')
  order by p.created_at limit 1`;
if (!target) throw new Error("No suitable product: the demo customer has received every demo product.");
console.log("Testing with: " + target.title);
await sql`delete from product_reviews where product_id = ${target.id} and customer_id = ${cust.id}`;

// --- not yet a buyer
let r = await shop(`/api/v1/reviews/eligibility?productId=${target.id}`);
check("eligibility: signed in but not delivered", r.json?.signedIn === true && r.json?.canReview === false, JSON.stringify(r.json));
r = await shop("/api/v1/reviews", { method: "POST", body: { productId: target.id, rating: 5 } });
check("review before delivery rejected", r.status === 403, String(r.status));
r = await client(SF)(`/api/v1/reviews/eligibility?productId=${target.id}`);
check("eligibility: signed out", r.json?.signedIn === false, JSON.stringify(r.json));

// --- buy it and mark delivered (simulating the courier update)
for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: target.variant_id, quantity: 1 } });
const address = await shop("/api/v1/addresses", { method: "POST", body: { line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001", isDefault: true } });
const addressId = address.json?.address?.id ?? address.json?.item?.id ?? address.json?.id;
r = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
check("order placed", r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const orderId = r.json?.orderId;
await sql`update orders set status = 'DELIVERED', delivered_at = now() where id = ${orderId}`;
r = await shop(`/api/v1/orders/${orderId}`);
check("order shows product link for Rate & review", r.json?.order?.items?.[0]?.productSlug === target.slug);

r = await shop(`/api/v1/reviews/eligibility?productId=${target.id}`);
check("eligibility: verified buyer can review", r.json?.canReview === true && r.json?.review === null, JSON.stringify(r.json));

// --- photo upload (customer)
const bytes = png(800, 600);
let t = await shop("/api/v1/media/uploads", { method: "POST", body: { purpose: "REVIEW_IMAGE", contentType: "image/png", byteSize: bytes.length } });
await shop(t.json.uploadUrl, { method: "PUT", raw: bytes, contentType: "image/png" });
const photo = (await shop("/api/v1/media/uploads/complete", { method: "POST", body: { token: t.json.token } })).json;
check("customer uploads a review photo (any shape)", Boolean(photo?.mediaAssetId) && photo.url.startsWith("/media/review-media/"), JSON.stringify(photo?.url ?? photo));
t = await shop("/api/v1/media/uploads", { method: "POST", body: { purpose: "PRODUCT_IMAGE", contentType: "image/png", byteSize: bytes.length } });
check("customer can't upload product images", t.status === 400, String(t.status));
check("review photo is publicly viewable", (await fetch(SF + photo.url)).status === 200);
const [sellerAsset] = await sql`select ma.id from media_assets ma join product_media pm on pm.media_asset_id = ma.id where pm.product_id = ${target.id} limit 1`;

// --- validation
r = await shop("/api/v1/reviews", { method: "POST", body: { productId: target.id, rating: 6 } });
check("rating above 5 rejected", r.status === 400, String(r.status));
r = await shop("/api/v1/reviews", { method: "POST", body: { productId: target.id, rating: 5, body: "Buy cheaper at www.spam-shop.com" } });
check("links in review rejected", r.status === 400, String(r.status));
if (sellerAsset) {
  r = await shop("/api/v1/reviews", { method: "POST", body: { productId: target.id, rating: 5, mediaAssetIds: [sellerAsset.id] } });
  check("someone else's image rejected", r.status === 403, String(r.status));
}

// --- write, then edit
r = await shop("/api/v1/reviews", { method: "POST", body: { productId: target.id, rating: 5, title: `E2E heavy and sturdy ${RUN}`, body: "Cooks evenly on induction.", mediaAssetIds: [photo.mediaAssetId] } });
check("verified buyer posts review", r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const reviewId = r.json?.review?.id;
let [p] = await sql`select review_count, rating_total from products where id = ${target.id}`;
const baseCount = p.review_count - 1, baseTotal = p.rating_total - 5;
check("product totals updated", p.review_count >= 1, JSON.stringify(p));
r = await shop("/api/v1/reviews", { method: "POST", body: { productId: target.id, rating: 4, title: `E2E heavy and sturdy ${RUN}`, body: "Cooks evenly on induction. Lid is a bit loose.", mediaAssetIds: [photo.mediaAssetId] } });
[p] = await sql`select review_count, rating_total from products where id = ${target.id}`;
check("editing updates, not duplicates", r.status === 200 && p.review_count === baseCount + 1 && p.rating_total === baseTotal + 4, JSON.stringify(p));

let page = await html(`/products/${target.slug}`);
check("product page shows the review", page.includes(`E2E heavy and sturdy ${RUN}`) && page.includes("Verified buyer") && page.includes("Ratings &amp; reviews"));
check("product page shows customer photo", page.includes(photo.url.replace("/media/", "")));
const product = ld(page).find((x) => x["@type"] === "Product");
check("Google data includes star rating", Number(product?.aggregateRating?.reviewCount) === p.review_count && product.review?.length >= 1, JSON.stringify(product?.aggregateRating));
r = await fetch(`${SF}/api/v1/catalog/products?limit=60`).then((x) => x.json());
check("product cards carry the rating", r.items?.find((x) => x.id === target.id)?.reviewCount === p.review_count);
r = await fetch(`${SF}/api/v1/reviews?productId=${target.id}&rating=4`).then((x) => x.json());
check("reviews API filters by stars", r.items?.every((x) => x.rating === 4) && r.items.some((x) => x.id === reviewId) && r.summary?.count === p.review_count);

// --- seller reply
r = await seller("/api/v1/reviews");
check("seller sees reviews of own products", r.status === 200 && r.json?.items?.some((x) => x.id === reviewId), String(r.status));
r = await seller(`/api/v1/reviews/${reviewId}/reply`, { method: "POST", body: { reply: `Thank you! E2E reply ${RUN}` } });
check("seller replies", r.status === 200, String(r.status));
if (e2eSeller) {
  r = await otherSeller(`/api/v1/reviews/${reviewId}/reply`, { method: "POST", body: { reply: "Not my product" } });
  check("other seller can't reply", r.status === 404, String(r.status));
  r = await otherSeller("/api/v1/reviews");
  check("other seller doesn't see it", !r.json?.items?.some((x) => x.id === reviewId));
}
page = await html(`/products/${target.slug}`);
check("seller reply shown on product page", page.includes(`E2E reply ${RUN}`) && page.includes("Reply from the seller"));

// --- admin moderation
r = await admin("/api/v1/reviews?q=" + encodeURIComponent(`sturdy ${RUN}`));
check("admin finds the review", r.json?.items?.length === 1 && r.json.items[0].customerEmail === "demo.customer@azadimart.test", String(r.json?.items?.length));
r = await admin(`/api/v1/reviews/${reviewId}`, { method: "PATCH", body: { status: "HIDDEN" } });
check("hiding needs a reason", r.status === 400, String(r.status));
r = await admin(`/api/v1/reviews/${reviewId}`, { method: "PATCH", body: { status: "HIDDEN", reason: "E2E test" } });
[p] = await sql`select review_count from products where id = ${target.id}`;
page = await html(`/products/${target.slug}`);
check("hidden review leaves page and totals", r.status === 200 && p.review_count === baseCount && !page.includes(`E2E heavy and sturdy ${RUN}`), JSON.stringify(p));
r = await seller(`/api/v1/reviews/${reviewId}/reply`, { method: "POST", body: { reply: "x" } });
check("can't reply to a hidden review", r.status === 404, String(r.status));
r = await admin(`/api/v1/reviews/${reviewId}`, { method: "PATCH", body: { status: "PUBLISHED" } });
[p] = await sql`select review_count from products where id = ${target.id}`;
check("admin publishes it again", r.status === 200 && p.review_count === baseCount + 1);
const audits = await sql`select action from audit_logs where entity_id = ${reviewId}`;
check("moderation and replies audited", ["REVIEW_HIDDEN", "REVIEW_PUBLISHED", "REVIEW_REPLY_SAVED"].every((a) => audits.some((x) => x.action === a)));
const adminAsCustomer = (await shop(`${AD}/api/v1/reviews`)).status;
check("customers can't use the admin API", adminAsCustomer === 401 || adminAsCustomer === 403, String(adminAsCustomer));

// --- delete own review, then tidy up the test order
r = await shop(`/api/v1/reviews/${reviewId}`, { method: "DELETE" });
[p] = await sql`select review_count, rating_total from products where id = ${target.id}`;
check("customer deletes own review; totals restored", r.status === 200 && p.review_count === baseCount && p.rating_total === baseTotal, JSON.stringify(p));
await sql`update orders set status = 'CANCELLED' where id = ${orderId}`;
await sql`update inventory set reserved = greatest(0, reserved - 1) where variant_id = ${target.variant_id}`;

// --- imported reviews: genuine reviews from other sites, with a private screenshot as proof
const proofForm = () => { const f = new FormData(); f.append("file", new Blob([png(40, 40)], { type: "image/png" }), "proof.png"); return f; };
r = await seller("/api/v1/reviews/proofs", { method: "POST", raw: proofForm() });
const sellerProof = r.json?.proofAssetId;
check("seller uploads a proof screenshot", r.status === 201 && Boolean(sellerProof), String(r.status));
const [proofRow] = await sql`select storage_key, kind from media_assets where id = ${sellerProof}`;
check("proof is private (not served by /media)", proofRow?.kind === "DOCUMENT" && (await fetch(`${SF}/media/${proofRow.storage_key}`)).status === 404);
const importBody = { productId: target.id, rating: 4, title: "", body: `Lovely quality, arrived well packed ${RUN}`, authorName: "Anita Rao", sourceName: "E2E Source", reviewedAt: "2026-09-01", proofAssetId: sellerProof };
const [othersProduct] = await sql`select p.id from products p join sellers s on s.id = p.seller_id join users u on u.id = s.user_id where u.email <> 'demo.seller@azadimart.test' limit 1`;
if (othersProduct) { r = await seller("/api/v1/reviews", { method: "POST", body: { ...importBody, productId: othersProduct.id } }); check("seller can't import onto another seller's product", r.status === 404, String(r.status)); }
r = await seller("/api/v1/reviews", { method: "POST", body: { ...importBody, body: "Great, see www.spam.com for more" } });
check("links are rejected in imported reviews", r.status === 400, String(r.status));
r = await seller("/api/v1/reviews", { method: "POST", body: { ...importBody, proofAssetId: crypto.randomUUID() } });
check("an import needs the seller's own screenshot", r.status === 400, String(r.status));
r = await shop(`${SE}/api/v1/reviews`, { method: "POST", body: importBody });
check("customers can't import reviews", r.status === 401 || r.status === 403, String(r.status));
[p] = await sql`select review_count, rating_total from products where id = ${target.id}`;
const beforeImport = p;
r = await seller("/api/v1/reviews", { method: "POST", body: importBody });
const importId = r.json?.id;
check("seller's import waits for approval", r.status === 201 && r.json?.status === "PENDING", String(r.status));
page = await html(`/products/${target.slug}`);
check("a waiting import is not on the store", !page.includes(`arrived well packed ${RUN}`));
r = await seller("/api/v1/reviews");
check("seller sees the import as waiting", r.json?.items?.some((x) => x.id === importId && x.status === "PENDING" && x.source === "IMPORTED"));
r = await admin("/api/v1/reviews?status=PENDING");
check("admin sees it in Waiting for approval", r.json?.items?.some((x) => x.id === importId && x.hasProof) && r.json?.pendingCount >= 1);
const proofView = await fetch(`${AD}/api/v1/reviews/${importId}/proof`, { headers: { cookie: "" } });
check("the screenshot needs an admin sign-in", proofView.status === 401 || proofView.status === 403, String(proofView.status));
r = await admin(`/api/v1/reviews/${importId}`, { method: "PATCH", body: { status: "PUBLISHED" } });
page = await html(`/products/${target.slug}`);
[p] = await sql`select review_count, rating_total from products where id = ${target.id}`;
check("approved import shows labelled 'Imported from'", r.status === 200 && page.includes(`arrived well packed ${RUN}`) && page.includes("Imported from E2E Source"));
check("imports never change the star rating", p.review_count === beforeImport.review_count && p.rating_total === beforeImport.rating_total, JSON.stringify(p));
check("imports never go to Google's review data", !JSON.stringify(ld(page)).includes(`arrived well packed ${RUN}`));
r = await admin(`/api/v1/reviews/${importId}`, { method: "PATCH", body: { pinned: true } });
const listed = (await shop(`/api/v1/reviews?productId=${target.id}`)).json;
check("admin pins it to the top", r.status === 200 && listed?.items?.[0]?.id === importId && listed.items[0].pinned === true, JSON.stringify(listed?.items?.[0]?.id));
r = await admin("/api/v1/reviews/proofs", { method: "POST", raw: proofForm() });
r = await admin("/api/v1/reviews", { method: "POST", body: { ...importBody, body: `Admin-added genuine review ${RUN}`, proofAssetId: r.json?.proofAssetId } });
const adminImport = r.json?.id;
const [adminRow] = adminImport ? await sql`select status from product_reviews where id = ${adminImport}` : [];
check("admin's import goes live at once", r.status === 201 && adminRow?.status === "PUBLISHED", String(r.status));
r = await seller("/api/v1/reviews/proofs", { method: "POST", raw: proofForm() });
r = await seller("/api/v1/reviews", { method: "POST", body: { ...importBody, body: `To be rejected ${RUN}`, proofAssetId: r.json?.proofAssetId } });
const rejectId = r.json?.id;
r = await admin(`/api/v1/reviews/${rejectId}`, { method: "PATCH", body: { status: "HIDDEN", reason: "Can't confirm the source" } });
r = await seller("/api/v1/reviews");
check("seller sees why an import was rejected", r.json?.items?.some((x) => x.id === rejectId && x.status === "HIDDEN" && x.hiddenReason === "Can't confirm the source"));
const importAudits = await sql`select action from audit_logs where entity_id = ${importId}`;
check("imports, approvals and pins are audited", ["REVIEW_IMPORTED", "REVIEW_IMPORT_APPROVED", "REVIEW_PINNED"].every((a) => importAudits.some((x) => x.action === a)), JSON.stringify(importAudits));
await sql`delete from product_reviews where id in (${importId}, ${adminImport ?? importId}, ${rejectId ?? importId})`;

// --- bulk import (CSV rows + one proof file for the whole upload)
const [sku] = await sql`select sku from product_variants where product_id = ${target.id} limit 1`;
const [othersSku] = await sql`select v.sku from product_variants v join products p on p.id = v.product_id join sellers s on s.id = p.seller_id join users u on u.id = s.user_id where u.email <> 'demo.seller@azadimart.test' limit 1`;
const pdfForm = () => { const f = new FormData(); f.append("file", new Blob([Buffer.from("%PDF-1.4\n% e2e review export\n")], { type: "application/pdf" }), "export.pdf"); return f; };
r = await seller("/api/v1/reviews/proofs", { method: "POST", raw: pdfForm() });
const bulkProof = r.json?.proofAssetId;
check("a PDF export is accepted as proof", r.status === 201 && Boolean(bulkProof), String(r.status));
const row = (n, extra = {}) => ({ sku: sku.sku.toLowerCase(), sourceName: "E2E Bulk", authorName: `Bulk Reviewer ${n}`, rating: 5, reviewedAt: "2026-08-15", title: "", body: `Bulk imported review number ${n} ${RUN}`, ...extra });
r = await seller("/api/v1/reviews/bulk", { method: "POST", body: { proofAssetId: bulkProof, dryRun: true, rows: [row(1), row(2, { rating: 9 }), row(3, { sku: othersSku?.sku ?? "NO-SUCH-SKU" }), row(1)] } });
const lines = (r.json?.problems ?? []).map((x) => x.line);
check("bulk check reports each bad row by line", r.status === 422 && lines.includes(3) && lines.includes(4) && lines.includes(5) && !lines.includes(2), JSON.stringify(r.json?.problems));
r = await seller("/api/v1/reviews/bulk", { method: "POST", body: { proofAssetId: bulkProof, dryRun: false, rows: [row(1), row(2, { rating: 9 })] } });
const [{ n: savedBad }] = await sql`select count(*)::int n from product_reviews where body like ${"Bulk imported review number % " + RUN}`;
check("nothing is saved while any row has a problem", r.status === 422 && savedBad === 0, String(savedBad));
r = await seller("/api/v1/reviews/bulk", { method: "POST", body: { proofAssetId: bulkProof, dryRun: true, rows: [row(1), row(2), row(3)] } });
check("a clean file checks out", r.status === 200 && r.json?.ready === 3, JSON.stringify(r.json));
r = await seller("/api/v1/reviews/bulk", { method: "POST", body: { proofAssetId: bulkProof, dryRun: false, rows: [row(1), row(2), row(3)] } });
const [{ n: pendingBulk }] = await sql`select count(*)::int n from product_reviews where body like ${"Bulk imported review number % " + RUN} and status = 'PENDING'`;
check("seller's bulk upload waits for approval", r.status === 201 && r.json?.created === 3 && pendingBulk === 3, String(pendingBulk));
r = await seller("/api/v1/reviews/bulk", { method: "POST", body: { proofAssetId: bulkProof, dryRun: true, rows: [row(1)] } });
check("re-uploading the same review is caught", r.status === 422 && /already on LOIMART/.test(r.json?.problems?.[0]?.message ?? ""));
r = await admin("/api/v1/reviews/bulk/decision", { method: "POST", body: { proofAssetId: bulkProof, decision: "APPROVE" } });
page = await html(`/products/${target.slug}`);
check("admin approves the whole upload at once", r.status === 200 && r.json?.count === 3 && page.includes("Imported from E2E Bulk"), JSON.stringify(r.json));
r = await admin("/api/v1/reviews/proofs", { method: "POST", raw: pdfForm() });
r = await admin("/api/v1/reviews/bulk", { method: "POST", body: { proofAssetId: r.json?.proofAssetId, rows: [row(4, { sku: othersSku?.sku ?? sku.sku })] } });
const [adminBulk] = await sql`select status from product_reviews where body = ${"Bulk imported review number 4 " + RUN}`;
check("admin bulk upload covers any seller and goes live", r.status === 201 && adminBulk?.status === "PUBLISHED", String(r.status));
await sql`delete from product_reviews where body like ${"Bulk imported review number % " + RUN}`;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
