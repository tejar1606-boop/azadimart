// End-to-end test for sellers updating stock on one SKU (e.g. after it runs
// out): units ready to sell, with units held for open orders kept on top;
// logged as a stock adjustment; only the seller's own products. Requires the
// demo seed and the apps (test server) against a NON-PRODUCTION database.
// Restores the stock it changes.
//   ALLOW_E2E=YES pnpm e2e:stock-update
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'login:%' or key like 'ip:%'`;
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, raw } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch((path.startsWith("http") ? "" : base) + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, text: raw ? await res.text() : null, json: raw ? null : await res.json().catch(() => null) };
  };
}
const seller = client(SE), shop = client(SF);
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
const [me] = await sql`select s.id from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const [v] = await sql`select v.id, v.sku, i.on_hand, i.reserved from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active order by p.created_at limit 1`;
const [other] = await sql`select v.id from product_variants v join products p on p.id = v.product_id where p.seller_id <> ${me.id} limit 1`;
const started = new Date();
async function tidy() {
  await sql`update inventory set on_hand = ${v.on_hand} where variant_id = ${v.id}`;
  await sql`delete from inventory_movements where variant_id = ${v.id} and reference_type = 'SELLER_STOCK_UPDATE' and created_at >= ${started}`;
  await sql`delete from audit_logs where action = 'STOCK_UPDATED' and entity_id = ${v.id} and created_at >= ${started}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });

const stock = async () => (await sql`select on_hand, reserved from inventory where variant_id = ${v.id}`)[0];
let r = await seller("/api/v1/products/stock");
check("seller sees every SKU with its stock", r.status === 200 && r.json.items.some((i) => i.variantId === v.id && i.sku === v.sku && typeof i.reserved === "number"));

// Runs out…
r = await seller("/api/v1/products/stock", { method: "PATCH", body: { variantId: v.id, available: 0 } });
let s = await stock();
check("mark out of stock: only units held for orders stay", r.status === 200 && r.json.available === 0 && s.on_hand === s.reserved, JSON.stringify({ r: r.json, s }));
check("shoppers can't add it to the cart", (await shop("/api/v1/cart", { method: "POST", body: { variantId: v.id, quantity: 1 } })).status >= 400);
// …and is restocked.
r = await seller("/api/v1/products/stock", { method: "PATCH", body: { variantId: v.id, available: 12 } });
s = await stock();
check("update stock: 12 ready to sell on top of held units", r.status === 200 && r.json.available === 12 && s.on_hand === 12 + s.reserved, JSON.stringify({ r: r.json, s }));
const moves = await sql`select quantity from inventory_movements where variant_id = ${v.id} and reference_type = 'SELLER_STOCK_UPDATE' and created_at >= ${started} order by created_at`;
check("logged as stock adjustments", moves.length === 2 && moves[1].quantity === 12, JSON.stringify(moves));
check("audited", (await sql`select count(*)::int n from audit_logs where action = 'STOCK_UPDATED' and entity_id = ${v.id} and created_at >= ${started}`)[0].n === 2);
r = await seller("/api/v1/products/stock", { method: "PATCH", body: { variantId: v.id, available: 12 } });
check("same number again: nothing logged", r.json?.changed === false && (await sql`select count(*)::int n from inventory_movements where variant_id = ${v.id} and reference_type = 'SELLER_STOCK_UPDATE' and created_at >= ${started}`)[0].n === 2);
check("negative stock refused", (await seller("/api/v1/products/stock", { method: "PATCH", body: { variantId: v.id, available: -1 } })).status === 400);
check("decimals refused", (await seller("/api/v1/products/stock", { method: "PATCH", body: { variantId: v.id, available: 2.5 } })).status === 400);
if (other) check("another seller's product: not found", (await seller("/api/v1/products/stock", { method: "PATCH", body: { variantId: other.id, available: 5 } })).status === 404);
check("shoppers can't change stock", [401, 403].includes((await shop(`${SE}/api/v1/products/stock`, { method: "PATCH", body: { variantId: v.id, available: 99 } })).status));
check("Inventory page loads", (await seller("/inventory?filter=out", { raw: true })).status === 200);

await tidy();
check("stock restored", (await stock()).on_hand === v.on_hand);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
