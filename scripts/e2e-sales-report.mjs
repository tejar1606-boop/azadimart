// End-to-end test for the admin Sales report: orders per India-time day and per
// delivery state (state names tidied up), sales without cancelled/returned
// orders, the CSV download, the dashboard link and staff-only access. Adds a
// few test orders straight into a NON-PRODUCTION database and deletes them.
//   ALLOW_E2E=YES ADMIN_URL=… pnpm e2e:sales-report
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
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
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = [...cookie.split("; ").filter((c) => c && !set.some((s) => s.startsWith(c.split("=")[0] + "="))), ...set.map((c) => c.split(";")[0])].join("; ");
    return { status: res.status, headers: res.headers, text: raw ? await res.text() : null, json: raw ? null : await res.json().catch(() => null) };
  };
}

const PREFIX = "E2E-SR-";
const tidy = () => sql`delete from orders where order_number like ${PREFIX + "%"}`;
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });
await tidy();

const admin = client(AD), anon = client(AD);
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
const customerId = (await sql`select c.id from customers c join users u on u.id = c.user_id where u.email = 'demo.customer@azadimart.test'`)[0]?.id;
if (!customerId) throw new Error("Need the demo customer.");

const before = (await admin("/api/v1/orders/report?days=7")).json;
check("report loads for admin", before?.days?.length === 7 && Array.isArray(before.states), `days=${before?.days?.length}`);
const stateOf = (r, s) => r.states.find((x) => x.state === s) ?? { orders: 0, salesPaise: 0, cancelled: 0, returned: 0 };
const today = before.days[6].day, yesterday = before.days[5].day;
// Moments inside today/yesterday in India time (just after midnight IST is still "today" there).
const istNoon = (day) => new Date(Date.parse(day + "T12:00:00+05:30"));
const now = new Date();
const todayAt = new Date(Math.max(Date.parse(today + "T00:00:30+05:30"), now.getTime() - 60_000));

let seq = 0;
async function order(state, status, paise, at, city = "Test City") {
  await sql`insert into orders (order_number, customer_id, status, subtotal_paise, grand_total_paise, shipping_address_snapshot, created_at, updated_at)
    values (${PREFIX + Date.now() + "-" + ++seq}, ${customerId}, ${status}, ${paise}, ${paise}, ${JSON.stringify({ line1: "1 Test Rd", city, state, postalCode: "500001", country: "IN" })}::jsonb, ${at}, ${at})`;
}
// Today: 2 Telangana (one typed oddly), 1 Lakshadweep cancelled, 1 still unpaid (not counted)
await order("Telangana", "PAID", 50_000, todayAt, "hyderabad");
await order("  telangana ", "DELIVERED", 30_000, todayAt, "Warangal");
await order("Lakshadweep", "CANCELLED", 20_000, todayAt);
await order("Lakshadweep", "PAYMENT_PENDING", 99_000, todayAt);
// Yesterday: 1 Orissa returned, 1 with a typo state
await order("Orissa", "RETURNED", 40_000, istNoon(yesterday));
await order("Hyderabad", "CONFIRMED", 10_000, istNoon(yesterday));
// 10 days ago: outside the 7-day window
await order("Telangana", "PAID", 70_000, istNoon(new Date(Date.parse(today) - 10 * 86_400_000).toISOString().slice(0, 10)));

const after = (await admin("/api/v1/orders/report?days=7")).json;
const d = (r, i) => r.days[i];
check("today: 3 more orders placed (unpaid not counted)", d(after, 6).orders - d(before, 6).orders === 3, `${d(before, 6).orders}→${d(after, 6).orders}`);
check("today: sales +₹800 (cancelled left out)", d(after, 6).salesPaise - d(before, 6).salesPaise === 80_000);
check("today: 1 more cancelled", d(after, 6).cancelled - d(before, 6).cancelled === 1);
check("yesterday: 2 more orders, 1 returned, sales +₹100", d(after, 5).orders - d(before, 5).orders === 2 && d(after, 5).returned - d(before, 5).returned === 1 && d(after, 5).salesPaise - d(before, 5).salesPaise === 10_000);
check("10-day-old order is outside the last 7 days", after.totals.orders - before.totals.orders === 5);
check("Telangana: both spellings counted together", stateOf(after, "Telangana").orders - stateOf(before, "Telangana").orders === 2 && stateOf(after, "Telangana").salesPaise - stateOf(before, "Telangana").salesPaise === 80_000);
check("Telangana top cities include Hyderabad (tidied)", stateOf(after, "Telangana").topCities.includes("Hyderabad"), stateOf(after, "Telangana").topCities.join(","));
check("Orissa counted as Odisha, returned", stateOf(after, "Odisha").returned - stateOf(before, "Odisha").returned === 1);
check("Lakshadweep: cancelled counted, unpaid not", stateOf(after, "Lakshadweep").orders - stateOf(before, "Lakshadweep").orders === 1 && stateOf(after, "Lakshadweep").cancelled - stateOf(before, "Lakshadweep").cancelled === 1);
check("Lakshadweep no longer in 'no orders yet'", !after.noOrders.includes("Lakshadweep"));
check("unknown state grouped separately", stateOf(after, "Not a known state").orders - stateOf(before, "Not a known state").orders === 1);
check("states sorted by most orders", after.states.every((s, i, a) => i === 0 || a[i - 1].orders >= s.orders));
check("states + no-orders cover all 36", after.states.filter((s) => s.state !== "Not a known state").length + after.noOrders.length === 36);

const csv = await admin("/api/v1/orders/report?days=30&format=csv", { raw: true });
check("CSV download", csv.status === 200 && /text\/csv/.test(csv.headers.get("content-type") ?? "") && /attachment; filename="loimart-sales-30-days-/.test(csv.headers.get("content-disposition") ?? ""));
check("CSV has days and states", csv.text.includes("Orders by day") && csv.text.includes("Orders by state") && /\r\nTelangana,\d+,/.test(csv.text) && csv.text.includes(today));
const page = await admin("/orders/report?days=7", { raw: true });
check("report page renders", page.status === 200 && page.text.includes("Orders by state") && page.text.includes("Telangana") && page.text.replace(/<!-- -->/g, "").includes("Last 90 days"));
const dash = await admin("/dashboard", { raw: true });
check("dashboard links to the report", dash.status === 200 && dash.text.includes('href="/orders/report"'));
check("not signed in: API refused", (await anon("/api/v1/orders/report")).status === 401);
check("not signed in: page sends to login", [302, 303, 307, 308].includes((await anon("/orders/report", { raw: true })).status));
check("bad period falls back to 30 days", (await admin("/api/v1/orders/report?days=5")).json?.days?.length === 30);

await tidy();
check("test orders removed", (await sql`select count(*)::int n from orders where order_number like ${PREFIX + "%"}`)[0].n === 0);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
