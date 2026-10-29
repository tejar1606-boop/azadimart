// End-to-end test for editing coupons in Admin: change value, dates, limits
// and which products it covers; clear optional limits; refuse bad edits.
//   ALLOW_E2E=YES ADMIN_URL=… pnpm e2e:coupon-edit
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
let cookie = "";
const admin = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(AD + path, { method, headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? []; if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, json: await res.json().catch(() => null) };
};
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
const RUN = Date.now().toString(36).toUpperCase();
const [product] = await sql`select id, title from products where status = 'LIVE' order by created_at limit 1`;

let r = await admin("/api/v1/coupons", { method: "POST", body: { code: `EDIT${RUN}`, title: "E2E edit test", discountType: "PERCENTAGE", discountValue: 10, minimumOrderPaise: 50000, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 7 * 86400000).toISOString(), usageLimit: 100, perCustomerLimit: 1 } });
const id = r.json?.coupon?.id;
check("admin creates a coupon", r.status === 201 || r.status === 200, String(r.status));
const end = new Date(Date.now() + 30 * 86400000).toISOString();
r = await admin(`/api/v1/coupons/${id}`, { method: "PATCH", body: { title: "E2E edited", discountValue: 15, minimumOrderPaise: 99900, maximumDiscountPaise: 20000, endsAt: end, scope: { productIds: [product.id], categoryIds: [], sellerIds: [] } } });
check("admin edits value, minimum, max discount, end date and products", r.status === 200 && r.json.coupon.discountValue === 15 && r.json.coupon.minimumOrderPaise === 99900 && r.json.coupon.maximumDiscountPaise === 20000 && r.json.coupon.scope.productIds[0] === product.id, String(r.status));
r = await admin("/api/v1/coupons");
const listed = r.json?.coupons?.find((c) => c.id === id);
check("the list shows the edit, including the chosen product (for editing again)", listed?.title === "E2E edited" && listed.scopeProducts?.[0]?.id === product.id && listed.appliesTo?.includes(product.title.slice(0, 10)), JSON.stringify(listed && { appliesTo: listed.appliesTo }));
r = await admin(`/api/v1/coupons/${id}`, { method: "PATCH", body: { endsAt: null, usageLimit: null, maximumDiscountPaise: null } });
check("optional limits can be cleared", r.status === 200 && r.json.coupon.endsAt === null && r.json.coupon.usageLimit === null && r.json.coupon.maximumDiscountPaise === null, JSON.stringify(r.json?.error ?? ""));
r = await admin(`/api/v1/coupons/${id}`, { method: "PATCH", body: { discountValue: 150 } });
check("a percentage above 100 is refused", r.status === 400, String(r.status));
const [other] = await sql`select code from coupons where id <> ${id} and deleted_at is null limit 1`;
if (other) { r = await admin(`/api/v1/coupons/${id}`, { method: "PATCH", body: { code: other.code } }); check("another coupon's code can't be reused", r.status === 409, String(r.status)); }
const audits = await sql`select count(*)::int n from audit_logs where entity_id = ${id} and action = 'COUPON_UPDATED'`;
check("edits are audited", audits[0].n >= 2);
await admin(`/api/v1/coupons/${id}`, { method: "DELETE" });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
