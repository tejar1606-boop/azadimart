// End-to-end test for admin category order: create a category at a chosen
// position, reorder a group, sub-categories kept within their parent, and the
// store following the order. Restores the original order and removes test
// categories. Requires the demo seed and the admin + storefront apps against a
// NON-PRODUCTION database.
//   ALLOW_E2E=YES ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:categories
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const RUN = Date.now().toString(36).slice(-5).toUpperCase();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

let cookie = "";
const admin = async (path, { method = "GET", body } = {}) => {
  const res = await fetch(AD + path, { method, headers: { cookie, origin: AD, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, json: await res.json().catch(() => null) };
};
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });

const original = await sql`select id, sort_order from categories`;
const created = [];
async function tidy() {
  for (const id of created.reverse()) { await sql`delete from audit_logs where entity_id = ${id}`; await sql`delete from categories where id = ${id}`; }
  for (const row of original) await sql`update categories set sort_order = ${row.sort_order} where id = ${row.id}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

const list = async () => (await admin("/api/v1/catalog/categories")).json.items;
const topIds = (items) => items.filter((c) => !c.parentId).map((c) => c.id);
let items = await list();
const tops = topIds(items);
check("there are main categories to arrange", tops.length >= 3, String(tops.length));

// --- create at a chosen position
let r = await admin("/api/v1/catalog/categories", { method: "POST", body: { name: `E2E Second ${RUN}`, position: 2 } });
if (r.json?.category?.id) created.push(r.json.category.id);
items = await list();
check("a new category goes where it was asked (position 2)", r.status === 201 && topIds(items)[1] === r.json.category.id, String(r.status));
check("the others keep their order around it", JSON.stringify(topIds(items).filter((id) => id !== r.json.category.id)) === JSON.stringify(tops));
r = await admin("/api/v1/catalog/categories", { method: "POST", body: { name: `E2E Last ${RUN}` } });
if (r.json?.category?.id) created.push(r.json.category.id);
items = await list();
check("without a position it goes at the end", topIds(items).at(-1) === r.json.category.id);
r = await admin("/api/v1/catalog/categories", { method: "POST", body: { name: `E2E First ${RUN}`, position: 1 } });
if (r.json?.category?.id) created.push(r.json.category.id);
items = await list();
check("position 1 puts it first", topIds(items)[0] === r.json.category.id);
r = await admin("/api/v1/catalog/categories", { method: "POST", body: { name: `E2E Far ${RUN}`, position: 400 } });
if (r.json?.category?.id) created.push(r.json.category.id);
items = await list();
check("a position past the end puts it last", topIds(items).at(-1) === r.json.category.id);
check("positions must be 1 or more", (await admin("/api/v1/catalog/categories", { method: "POST", body: { name: `E2E Zero ${RUN}`, position: 0 } })).status === 400);

// --- sub-categories at a position within their parent
const parent = created[0];
const subA = (await admin("/api/v1/catalog/categories", { method: "POST", body: { name: `E2E Sub A ${RUN}`, parentId: parent } })).json.category.id; created.push(subA);
const subB = (await admin("/api/v1/catalog/categories", { method: "POST", body: { name: `E2E Sub B ${RUN}`, parentId: parent, position: 1 } })).json.category.id; created.push(subB);
items = await list();
check("a sub-category goes to its position within the parent", JSON.stringify(items.filter((c) => c.parentId === parent).map((c) => c.id)) === JSON.stringify([subB, subA]));

// --- reorder (what drag and drop and the position menu send)
const now = topIds(await list());
const moved = [...now.slice(1), now[0]];
r = await admin("/api/v1/catalog/categories/order", { method: "PUT", body: { ids: moved } });
check("reordering a group saves the new order", r.status === 200 && JSON.stringify(topIds(await list())) === JSON.stringify(moved));
check("main and sub-categories can't be mixed in one order", (await admin("/api/v1/catalog/categories/order", { method: "PUT", body: { ids: [now[0], subA] } })).status === 400);
check("duplicates are refused", (await admin("/api/v1/catalog/categories/order", { method: "PUT", body: { ids: [now[0], now[0]] } })).status === 400);

// --- the store follows the admin order (visible main categories)
await admin("/api/v1/catalog/categories/order", { method: "PUT", body: { ids: tops } });
const store = (await (await fetch(`${SF}/api/v1/catalog/products?limit=1`)).json()).categories ?? [];
const visibleAdmin = (await list()).filter((c) => !c.parentId && c.isActive && !created.includes(c.id)).map((c) => c.id);
const storeTop = store.filter((c) => !c.parentId && !created.includes(c.id)).map((c) => c.id);
check("the store lists main categories in the admin order", JSON.stringify(storeTop) === JSON.stringify(visibleAdmin.filter((id) => storeTop.includes(id))), JSON.stringify([storeTop.length, visibleAdmin.length]));

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
