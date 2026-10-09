// End-to-end test for abandoned carts: a signed-in customer's idle cart is
// listed with products and value, idle filters and search work, a reminder is
// recorded, and an order within 7 days counts as recovered. Requires the demo
// seed + catalogue seed and the storefront and admin apps against a
// NON-PRODUCTION database.
//   ALLOW_E2E=YES ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:abandoned
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const SE = process.env.SELLER_URL ?? "http://localhost:3001";
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
const shop = client(SF), admin = client(AD), seller = client(SE);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });

const [{ variant_id: variantId, title }] = await sql`select v.id variant_id, p.title from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id where p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved > 3 and v.sku <> 'DEMO-KITCHEN-001' order by p.created_at limit 1`;
const [cust] = await sql`select c.id from customers c join users u on u.id = c.user_id where u.email = 'demo.customer@azadimart.test'`;

// --- leave 2 items in the cart, then make it look 2 hours old
for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
let r = await shop("/api/v1/cart", { method: "POST", body: { variantId, quantity: 2 } });
check("customer adds to cart", r.status === 200 || r.status === 201, String(r.status));
const [cart] = await sql`select id from carts where customer_id = ${cust.id}`;
await sql`update carts set updated_at = now() - interval '2 hours', last_reminder_at = null, reminder_count = 0 where id = ${cart.id}`;
await sql`update cart_items set updated_at = now() - interval '2 hours', created_at = now() - interval '2 hours' where cart_id = ${cart.id}`;

r = await admin("/api/v1/abandoned-carts?idle=1h");
const listed = r.json?.items?.find((c) => c.cartId === cart.id);
check("idle cart listed as abandoned", r.status === 200 && Boolean(listed), String(r.status));
check("shows customer, products and value", listed?.email === "demo.customer@azadimart.test" && listed.products[0]?.title === title && listed.products[0].quantity === 2 && listed.valuePaise === listed.products[0].pricePaise * 2, JSON.stringify(listed?.products?.[0]));
check("not in the 1-day filter yet", !(await admin("/api/v1/abandoned-carts?idle=24h")).json?.items?.some((c) => c.cartId === cart.id));
check("search by email finds it", (await admin("/api/v1/abandoned-carts?q=demo.customer")).json?.items?.some((c) => c.cartId === cart.id));
check("search for someone else doesn't", !(await admin("/api/v1/abandoned-carts?q=nobody-here")).json?.items?.some((c) => c.cartId === cart.id));
const before = r.json.summary;

// --- recent activity is not abandoned
await sql`update cart_items set updated_at = now() where cart_id = ${cart.id}`;
check("active cart (just now) not listed", !(await admin("/api/v1/abandoned-carts?idle=1h")).json?.items?.some((c) => c.cartId === cart.id));
await sql`update cart_items set updated_at = now() - interval '2 hours' where cart_id = ${cart.id}`;

// --- reminder, then the customer orders: recovered
r = await admin(`/api/v1/abandoned-carts/${cart.id}/reminder`, { method: "POST", body: { channel: "WHATSAPP" } });
check("reminder recorded", r.status === 200 && r.json?.reminderCount === 1, String(r.status));
r = await admin("/api/v1/abandoned-carts?idle=1h");
check("cart shows it was reminded", r.json?.items?.find((c) => c.cartId === cart.id)?.reminderCount === 1);
check("reminders counted in summary", r.json?.summary?.reminded >= before.reminded + 1, JSON.stringify(r.json?.summary));
const a = await shop("/api/v1/addresses", { method: "POST", body: { line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001", isDefault: true } });
const o = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: a.json?.address?.id ?? a.json?.item?.id ?? a.json?.id, paymentMethod: "COD" } });
check("customer completes the order", o.status === 201, o.status + " " + JSON.stringify(o.json?.error ?? ""));
r = await admin("/api/v1/abandoned-carts?idle=1h");
check("ordered cart leaves the list", !r.json?.items?.some((c) => c.cartId === cart.id));
check("counted as recovered with its value", r.json?.summary?.recovered >= before.recovered + 1 && r.json.summary.recoveredPaise >= before.recoveredPaise + o.json.grandTotalPaise, JSON.stringify(r.json?.summary));
const audits = await sql`select 1 from audit_logs where action = 'CART_REMINDER_SENT' and entity_id = ${cart.id}`;
check("reminder audited", audits.length >= 1);

// --- access
const asCustomer = (await shop(`${AD}/api/v1/abandoned-carts`)).status, asSeller = (await seller(`${AD}/api/v1/abandoned-carts`)).status;
check("customers and sellers can't see abandoned carts", [401, 403].includes(asCustomer) && [401, 403].includes(asSeller), `${asCustomer} ${asSeller}`);

// --- tidy up: cancel the test order and release its stock; clear the reminder
await sql`update orders set status = 'CANCELLED' where id = ${o.json.orderId}`;
await sql`update inventory set reserved = greatest(0, reserved - 2) where variant_id = ${variantId}`;
await sql`update carts set last_reminder_at = null, reminder_count = 0 where id = ${cart.id}`;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
