// End-to-end test for the admin Customers page: list, search (name/email/mobile),
// filters, customer details (orders, addresses, wallet), and blocking an account
// (signed out, can't sign in) then unblocking it. Uses a throwaway shopper it
// creates and deletes, against a NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… ADMIN_URL=… pnpm e2e:customers
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const clearLimits = () => sql`delete from rate_limit_buckets where key like 'login:%' or key like 'ip:%'`;
await clearLimits();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, raw } = {}) => {
    const headers = { cookie, origin: base };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = [...cookie.split("; ").filter((c) => c && !set.some((s) => s.startsWith(c.split("=")[0] + "="))), ...set.map((c) => c.split(";")[0])].join("; ");
    return { status: res.status, text: raw ? await res.text() : null, json: raw ? null : await res.json().catch(() => null) };
  };
}

const EMAIL = `e2e.customers.${Date.now()}@azadimart.test`;
const EMAIL2 = `e2e.customers2.${Date.now()}@azadimart.test`;
const PHONE = "9" + String(Date.now()).slice(-9);
const extraUsers = [];
async function tidy() {
  for (const id of extraUsers) {
    const cc = (await sql`select id from customers where user_id = ${id}`)[0];
    if (cc) {
      await sql`delete from orders where customer_id = ${cc.id}`;
      await sql`delete from audit_logs where entity_type = 'customer' and entity_id = ${cc.id}`;
      await sql`delete from customers where id = ${cc.id}`;
    }
    await sql`delete from users where id = ${id}`;
  }
  await sql`delete from login_attempts where email = ${EMAIL2}`;
  const u = (await sql`select id from users where email = ${EMAIL}`)[0];
  if (!u) return;
  const c = (await sql`select id from customers where user_id = ${u.id}`)[0];
  if (c) {
    await sql`delete from audit_logs where entity_type = 'customer' and entity_id = ${c.id}`;
    await sql`delete from customer_addresses where customer_id = ${c.id}`;
    await sql`delete from customers where id = ${c.id}`;
  }
  await sql`delete from sessions where user_id = ${u.id}`;
  await sql`delete from login_attempts where email = ${EMAIL}`;
  await sql`delete from users where id = ${u.id}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });

// A throwaway shopper with the demo password.
const hash = (await sql`select password_hash from users where email = 'demo.customer@azadimart.test'`)[0].password_hash;
const [u] = await sql`insert into users (email, phone, password_hash, role, status) values (${EMAIL}, ${PHONE}, ${hash}, 'CUSTOMER', 'ACTIVE') returning id`;
const [c] = await sql`insert into customers (user_id, full_name) values (${u.id}, 'Zeta Testcustomer') returning id`;
await sql`insert into customer_addresses (customer_id, label, line1, city, state, postal_code, is_default) values (${c.id}, 'Home', '7 Test Street', 'Vijayawada', 'Andhra Pradesh', '520001', true)`;

const admin = client(AD), shop = client(SF), anon = client(AD);
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
check("shopper can sign in", (await shop("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PW } })).status === 200);

const list = (await admin("/api/v1/customers")).json;
check("list loads with totals", Array.isArray(list?.items) && list.stats.all >= 2 && list.stats.today >= 1, `all=${list?.stats?.all} today=${list?.stats?.today}`);
check("newest first", list.items[0]?.id === c.id);
const byName = (await admin("/api/v1/customers?q=Testcustomer")).json;
check("search by name", byName.items.length === 1 && byName.items[0].id === c.id);
check("search by email", (await admin(`/api/v1/customers?q=${encodeURIComponent(EMAIL)}`)).json.items[0]?.id === c.id);
check("search by mobile (last digits)", (await admin(`/api/v1/customers?q=${PHONE.slice(-6)}`)).json.items.some((x) => x.id === c.id));
const demo = (await admin("/api/v1/customers?q=demo.customer@azadimart.test")).json.items[0];
check("demo customer shows orders and spend", demo && demo.orders > 0 && demo.spentPaise > 0, `orders=${demo?.orders}`);
check("'Have ordered' filter leaves out the new shopper", !(await admin("/api/v1/customers?status=BUYERS&q=Testcustomer")).json.items.length);

const page = await admin(`/customers/${c.id}`, { raw: true });
check("customer page shows details", page.status === 200 && page.text.includes("Zeta Testcustomer") && page.text.includes("Vijayawada") && page.text.includes(PHONE));
const listPage = await admin("/customers", { raw: true });
check("no more 'coming soon'", listPage.status === 200 && !/coming soon/i.test(listPage.text) && listPage.text.includes("Search name, email or mobile"));
const demoPage = await admin(`/customers/${demo.id}`, { raw: true });
check("demo customer page lists their orders", demoPage.status === 200 && /href="\/orders\?q=/.test(demoPage.text));

check("block needs a reason", (await admin(`/api/v1/customers/${c.id}`, { method: "PATCH", body: { blocked: true, reason: "" } })).status === 400);
const blocked = await admin(`/api/v1/customers/${c.id}`, { method: "PATCH", body: { blocked: true, reason: "E2E test block" } });
check("block account", blocked.status === 200 && blocked.json?.status === "DISABLED");
const sess = await shop("/api/auth/session");
check("blocked shopper is signed out", sess.status === 401 || !sess.json?.user, `status=${sess.status}`);
await clearLimits();
check("blocked shopper can't sign in", (await client(SF)("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PW } })).status !== 200);
check("'Blocked' filter finds them", (await admin("/api/v1/customers?status=DISABLED")).json.items.some((x) => x.id === c.id));
const audit = await sql`select action, metadata from audit_logs where entity_type = 'customer' and entity_id = ${c.id}`;
check("block is in the audit log with the reason", audit.some((a) => a.action === "CUSTOMER_BLOCKED" && a.metadata.reason === "E2E test block"));
check("page shows blocked + reason", (await admin(`/customers/${c.id}`, { raw: true })).text.includes("E2E test block"));
const unblocked = await admin(`/api/v1/customers/${c.id}`, { method: "PATCH", body: { blocked: false } });
check("unblock account", unblocked.status === 200 && unblocked.json?.status === "ACTIVE");
await clearLimits();
check("can sign in again", (await client(SF)("/api/auth/login", { method: "POST", body: { email: EMAIL, password: PW } })).status === 200);

check("not signed in: list refused", (await anon("/api/v1/customers")).status === 401);
check("not signed in: block refused", (await anon(`/api/v1/customers/${c.id}`, { method: "PATCH", body: { blocked: true, reason: "nope" } })).status === 401);
check("bad id: 404", (await admin("/api/v1/customers/not-a-uuid", { method: "PATCH", body: { blocked: false } })).status === 404);

// Delete profile: someone who never ordered is removed for good.
check("delete needs DELETE typed", (await admin(`/api/v1/customers/${c.id}`, { method: "DELETE", body: { confirm: "delete", reason: "test" } })).status === 400);
check("delete needs a reason", (await admin(`/api/v1/customers/${c.id}`, { method: "DELETE", body: { confirm: "DELETE", reason: "" } })).status === 400);
check("not signed in: delete refused", (await anon(`/api/v1/customers/${c.id}`, { method: "DELETE", body: { confirm: "DELETE", reason: "nope" } })).status === 401);
check("customer page offers Delete profile", (await admin(`/customers/${c.id}`, { raw: true })).text.includes("Delete profile"));
const del1 = await admin(`/api/v1/customers/${c.id}`, { method: "DELETE", body: { confirm: "DELETE", reason: "Customer asked to delete" } });
check("no orders: deleted for good", del1.status === 200 && del1.json?.mode === "DELETED", JSON.stringify(del1.json));
check("account, customer and address gone", (await sql`select (select count(*) from users where email = ${EMAIL})::int + (select count(*) from customers where id = ${c.id})::int + (select count(*) from customer_addresses where customer_id = ${c.id})::int n`)[0].n === 0);
check("deletion audited with reason", (await sql`select count(*)::int n from audit_logs where entity_type = 'customer' and entity_id = ${c.id} and action = 'CUSTOMER_DELETED' and metadata->>'reason' = 'Customer asked to delete' and metadata->>'mode' = 'DELETED'`)[0].n === 1);
check("deleted page is gone", (await admin(`/customers/${c.id}`, { raw: true })).status === 404);
await sql`delete from audit_logs where entity_type = 'customer' and entity_id = ${c.id}`;

// Someone with orders is anonymised: orders stay, personal details go.
const PHONE2 = "8" + String(Date.now()).slice(-9);
const [u2] = await sql`insert into users (email, phone, phone_verified_at, password_hash, role, status) values (${EMAIL2}, ${PHONE2}, now(), ${hash}, 'CUSTOMER', 'ACTIVE') returning id`;
extraUsers.push(u2.id);
const [c2] = await sql`insert into customers (user_id, full_name, referral_code) values (${u2.id}, 'Omega Orderer', ${"E2E" + String(Date.now()).slice(-6)}) returning id`;
const [a2] = await sql`insert into customer_addresses (customer_id, line1, city, state, postal_code) values (${c2.id}, '9 Old Road', 'Guntur', 'Andhra Pradesh', '522001') returning id`;
await sql`insert into customer_wallet_entries (customer_id, kind, amount_paise, remaining_paise) values (${c2.id}, 'ADJUSTMENT', 5000, 5000)`;
const snap = JSON.stringify({ name: "Omega Orderer", line1: "9 Old Road", city: "Guntur", state: "Andhra Pradesh", postalCode: "522001", country: "IN" });
const [o2] = await sql`insert into orders (order_number, customer_id, shipping_address_id, status, grand_total_paise, shipping_address_snapshot, created_at, delivered_at)
  values (${"E2E-CU-" + Date.now()}, ${c2.id}, ${a2.id}, 'SHIPPED', 49900, ${snap}::jsonb, now() - interval '40 days', null) returning id`;
const busy = await admin(`/api/v1/customers/${c2.id}`, { method: "DELETE", body: { confirm: "DELETE", reason: "asked" } });
check("order on its way: delete refused", busy.status === 409, busy.json?.error?.message);
await sql`update orders set status = 'DELIVERED', delivered_at = now() - interval '2 days' where id = ${o2.id}`;
check("inside return window: delete refused", (await admin(`/api/v1/customers/${c2.id}`, { method: "DELETE", body: { confirm: "DELETE", reason: "asked" } })).status === 409);
await sql`update orders set delivered_at = now() - interval '30 days' where id = ${o2.id}`;
check("page explains orders are kept", (await admin(`/customers/${c2.id}`, { raw: true })).text.includes("8 years"));
const del2 = await admin(`/api/v1/customers/${c2.id}`, { method: "DELETE", body: { confirm: "DELETE", reason: "Customer asked to delete" } });
check("with orders: anonymised", del2.status === 200 && del2.json?.mode === "ANONYMISED" && del2.json?.orders === 1, JSON.stringify(del2.json));
const [after] = await sql`select u.email, u.phone, u.password_hash, u.status, cu.full_name, cu.referral_code from users u join customers cu on cu.user_id = u.id where cu.id = ${c2.id}`;
check("name, email, mobile, password removed", after.full_name === "Deleted customer" && after.email.endsWith("@deleted.invalid") && after.phone === null && after.password_hash === null && after.status === "DISABLED" && after.referral_code === null);
check("addresses and wallet money removed", (await sql`select count(*)::int n from customer_addresses where customer_id = ${c2.id}`)[0].n === 0 && (await sql`select coalesce(sum(remaining_paise),0)::int n from customer_wallet_entries where customer_id = ${c2.id}`)[0].n === 0);
const [kept] = await sql`select status, grand_total_paise, shipping_address_snapshot->>'city' city, shipping_address_id from orders where id = ${o2.id}`;
check("order kept with its delivery copy", kept.status === "DELIVERED" && kept.grand_total_paise === 49900 && kept.city === "Guntur" && kept.shipping_address_id === null);
await clearLimits();
check("old email can't sign in", (await client(SF)("/api/auth/login", { method: "POST", body: { email: EMAIL2, password: PW } })).status !== 200);
check("old email is free to sign up again", (await sql`select count(*)::int n from users where email = ${EMAIL2}`)[0].n === 0);
const dpage = await admin(`/customers/${c2.id}`, { raw: true });
check("page shows 'profile was deleted', no delete button", dpage.text.includes("This profile was deleted") && !dpage.text.includes("Delete profile…"));
check("list shows Deleted", (await admin("/api/v1/customers?q=Deleted customer")).json.items.some((x) => x.id === c2.id));

await tidy();
check("test shopper removed", (await sql`select count(*)::int n from users where email = ${EMAIL}`)[0].n === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
