// End-to-end test for price / discount changes on a LIVE product: the seller's
// edit waits in QC (the store keeps the old price), approving applies it, and
// the product's price history records the change, who asked and who approved,
// flagging a raised MRP. Requires the demo seed + catalogue seed and the apps
// against a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… pnpm e2e:price-changes
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
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
const seller = client(SE), admin = client(AD);
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });

// A live single-size product of the demo seller with a real MRP and no edit already waiting.
const [p] = await sql`select p.id, p.coupon_max_discount_pct, v.id variant_id, v.price_paise, v.compare_at_paise, u.id seller_user from products p
  join sellers s on s.id = p.seller_id join users u on u.id = s.user_id
  join product_variants v on v.product_id = p.id and v.is_active
  where u.email = 'demo.seller@azadimart.test' and p.status = 'LIVE' and v.compare_at_paise > v.price_paise
    and (select count(*) from product_variants v2 where v2.product_id = p.id and v2.is_active) = 1
    and not exists (select 1 from qc_submissions q where q.product_id = p.id and q.proposed_changes is not null and q.status in ('PENDING', 'IN_REVIEW'))
    and exists (select 1 from product_media pm where pm.product_id = p.id and pm.kind = 'IMAGE')
  order by p.created_at limit 1`;
if (!p) throw new Error("Need a live single-size demo product with an MRP.");
const [adminUser] = await sql`select id from users where email = 'demo.admin@azadimart.test'`;
const started = new Date();
const restore = async () => {
  await sql`update product_variants set price_paise = ${p.price_paise}, compare_at_paise = ${p.compare_at_paise} where id = ${p.variant_id}`;
  await sql`update products set coupon_max_discount_pct = ${p.coupon_max_discount_pct} where id = ${p.id}`;
  await sql`delete from product_price_history where product_id = ${p.id} and created_at >= ${started}`;
};
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); restore().finally(() => process.exit(1)); });

// --- the seller raises the MRP (same selling price) to show a bigger discount
const current = (await seller(`/api/v1/products/${p.id}`)).json;
const raisedMrp = p.compare_at_paise * 2;
const body = {
  title: current.product.title, couponMaxDiscountPct: current.product.couponMaxDiscountPct, description: current.product.description ?? "", specifications: current.product.specifications ?? [],
  categoryId: current.product.categoryId, imageAssetIds: current.media.filter((m) => m.kind === "IMAGE").map((m) => m.id), videoAssetId: current.media.find((m) => m.kind === "VIDEO")?.id ?? null,
  variant: { sku: current.variant.sku, title: current.variant.title, pricePaise: current.variant.pricePaise, compareAtPaise: raisedMrp, weightGrams: current.variant.weightGrams },
  onHand: current.variant.onHand ?? 0,
};
let r = await seller(`/api/v1/products/${p.id}`, { method: "PATCH", body });
const [live] = await sql`select price_paise, compare_at_paise from product_variants where id = ${p.variant_id}`;
check("a live product's price edit waits for QC", r.status === 200 && /QC/i.test(r.json?.message ?? ""), r.json?.message ?? JSON.stringify(r.json?.error));
check("the store keeps the old MRP until approved", live.compare_at_paise === p.compare_at_paise, JSON.stringify(live));

r = await admin("/api/v1/qc");
const submission = (r.json?.items ?? []).find((x) => x.productId === p.id && x.kind === "EDIT");
check("QC sees the edit with the requested MRP", Boolean(submission) && submission.proposedChanges?.variant?.compareAtPaise === raisedMrp);

r = await admin("/api/v1/qc", { method: "POST", body: { qcSubmissionId: submission?.id, decision: "APPROVED" } });
const [after] = await sql`select compare_at_paise from product_variants where id = ${p.variant_id}`;
check("approving applies the new MRP", r.status === 200 && after.compare_at_paise === raisedMrp, String(r.status));

const history = await sql`select * from product_price_history where product_id = ${p.id} and created_at >= ${started}`;
const row = history[0];
check("price history records the change", history.length === 1 && row.mrp_paise_before === p.compare_at_paise && row.mrp_paise_after === raisedMrp && row.price_paise_before === p.price_paise, JSON.stringify(row && { before: row.mrp_paise_before, after: row.mrp_paise_after }));
check("…with who asked and who approved", row?.source === "SELLER_EDIT_APPROVED" && row.requested_by_user_id === p.seller_user && row.approved_by_user_id === adminUser.id);
check("…and flags the raised MRP", row?.mrp_raised === true);
r = await admin(`/api/v1/catalog/products/${p.id}/price-history`);
check("admin sees it on the product's price history", r.status === 200 && r.json?.items?.[0]?.mrpRaised === true && r.json.items[0].requestedBy === "demo.seller@azadimart.test" && r.json.items[0].approvedBy === "demo.admin@azadimart.test", JSON.stringify(r.json?.items?.[0] ?? r.json));
check("sellers can't read LOIMART's price history", [401, 403].includes((await seller(`${AD}/api/v1/catalog/products/${p.id}/price-history`)).status));

// --- coupon limit (seller's own money, applies at once) is tracked too
const newPct = p.coupon_max_discount_pct === 40 ? 30 : 40;
r = await seller(`/api/v1/products/${p.id}/coupon-limit`, { method: "PUT", body: { couponMaxDiscountPct: newPct } });
const [couponRow] = await sql`select * from product_price_history where product_id = ${p.id} and kind = 'COUPON_LIMIT' and created_at >= ${started}`;
check("a coupon-limit change is recorded", r.status === 200 && couponRow?.coupon_pct_before === p.coupon_max_discount_pct && couponRow.coupon_pct_after === newPct && couponRow.source === "SELLER_COUPON_LIMIT", JSON.stringify(couponRow && { b: couponRow.coupon_pct_before, a: couponRow.coupon_pct_after }));
r = await admin(`/api/v1/catalog/products/${p.id}/price-history`);
check("product page shows the coupon limit and the lowest price a customer can pay", r.json?.current?.couponPct === newPct && r.json.current.lowestWithCouponPaise === Math.round(p.price_paise * (100 - newPct) / 100), JSON.stringify(r.json?.current));
r = await admin("/api/v1/catalog/price-changes?days=7&show=coupon");
check("Discount changes lists it under Coupon limits", r.json?.items?.some((x) => x.id === couponRow?.id) && r.json.items.every((x) => x.kind === "COUPON_LIMIT"));
r = await admin("/api/v1/catalog/price-changes?days=7&show=mrp");
check("…and the raised MRP under MRP raised", r.json?.items?.some((x) => x.productId === p.id && x.mrpRaised) && r.json.counts.mrp >= 1, JSON.stringify(r.json?.counts));
check("sellers can't see Discount changes", [401, 403].includes((await seller(`${AD}/api/v1/catalog/price-changes`)).status));

await restore();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
