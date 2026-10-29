// End-to-end test for the shopper platform fee: ₹8 added once per order (any
// number of items), shown in the cart, on the order and in what the courier
// collects; sellers are still owed their full price; Admin can change it or
// switch it off. Requires the demo seed + catalogue seed and the apps (test
// server) against a NON-PRODUCTION database.
//   ALLOW_E2E=YES STOREFRONT_URL=… SELLER_URL=… ADMIN_URL=… pnpm e2e:platform-fee
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
const clearLimits = () => sql`delete from rate_limit_buckets where key like 'checkout:%' or key like 'register:%' or key like 'login:%' or key like 'ip:%'`;
await clearLimits();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
function client(base) {
  let cookie = "";
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: base, "x-forwarded-for": ip };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(path.startsWith("http") ? path : base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = [...cookie.split("; ").filter((c) => c && !set.some((s) => s.startsWith(c.split("=")[0] + "="))), ...set.map((c) => c.split(";")[0])].join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}

const saved = (await sql`select value from platform_settings where key = 'customer_platform_fee'`)[0]?.value;
const orders = [];
async function tidy() {
  for (const id of orders) await sql`update orders set status = 'CANCELLED' where id = ${id} and status <> 'CANCELLED'`;
  await sql`delete from platform_settings where key = 'customer_platform_fee'`;
  if (saved) await sql`insert into platform_settings (key, value) values ('customer_platform_fee', ${JSON.stringify(saved)}::jsonb)`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });
await sql`delete from platform_settings where key = 'customer_platform_fee'`; // default rules

const shop = client(SF), seller = client(SE), admin = client(AD);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
const products = await sql`select v.id variant_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  join sellers sl on sl.id = p.seller_id join users su on su.id = sl.user_id
  where su.email = 'demo.seller@azadimart.test' and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 5 and v.price_paise between 20000 and 200000 order by p.created_at desc limit 2`;
if (products.length < 2) throw new Error("Need two stocked live demo-seller products.");
const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "4 Brigade Road", city: "Bengaluru", state: "Karnataka", postalCode: "560025", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
async function buy(lines) {
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  for (const [variantId, quantity] of lines) await shop("/api/v1/cart", { method: "POST", body: { variantId, quantity } });
  const cart = (await shop("/api/v1/cart")).json;
  const o = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD", useWallet: false } });
  if (o.json?.orderId) orders.push(o.json.orderId); else throw new Error("Checkout failed: " + o.status + " " + JSON.stringify(o.json));
  return { cart, order: o.json };
}

let { cart, order } = await buy([[products[0].variant_id, 2], [products[1].variant_id, 1]]);
check("the cart shows the ₹8 platform fee", cart.platformFeePaise === 800, String(cart.platformFeePaise));
check("checkout adds ₹8 once for the whole order (3 items)", order.platformFeePaise === 800 && order.grandTotalPaise === order.subtotalPaise - order.discountPaise + 800, JSON.stringify(order));
const [row] = await sql`select platform_fee_paise, grand_total_paise, (select amount_paise from payments where order_id = ${order.orderId}) pay from orders where id = ${order.orderId}`;
check("the order and the Cash on Delivery amount include it", row.platform_fee_paise === 800 && row.pay === row.grand_total_paise);
const detail = (await shop(`/api/v1/orders/${order.orderId}`)).json;
check("the shopper's order page shows it", (detail?.order ?? detail)?.platformFeePaise === 800);
const [items] = await sql`select sum(unit_price_paise * quantity)::int line from order_items where order_id = ${order.orderId}`;
check("the seller is owed only the product price (the fee is LOIMART's)", items.line === order.subtotalPaise);
const mine = (await seller("/api/v1/orders")).json?.items?.find((o) => o.id === order.orderId);
const label = (await seller(`/api/v1/orders/${order.orderId}/label`)).json;
const [snap] = await sql`select shipping_address_snapshot->>'phone' phone from orders where id = ${order.orderId}`;
check("sellers see the address but never the customer's phone (order list or label)", mine?.shipTo?.full && mine.shipTo.line1 && !("phone" in mine.shipTo) && label?.shipTo?.line1 && !("phone" in label.shipTo) && !JSON.stringify([mine, label]).includes(snap.phone ?? "no-phone"), JSON.stringify(label?.shipTo));
check("the courier collects the full total including the fee", mine?.codCollectPaise === order.grandTotalPaise, JSON.stringify({ c: mine?.codCollectPaise, t: order.grandTotalPaise }));

let r = await admin("/api/v1/finance/platform-fee");
check("Admin sees the fee and orders that paid it", r.status === 200 && r.json.settings.feePaise === 800 && r.json.totals.orders >= 1, JSON.stringify(r.json?.totals));
check("nonsense amounts are refused", (await admin("/api/v1/finance/platform-fee", { method: "PUT", body: { enabled: true, feePaise: -5 } })).status === 400);
r = await admin("/api/v1/finance/platform-fee", { method: "PUT", body: { enabled: true, feePaise: 1000 } });
({ cart, order } = await buy([[products[0].variant_id, 1]]));
check("Admin changes it to ₹10 and new orders follow", r.status === 200 && cart.platformFeePaise === 1000 && order.platformFeePaise === 1000);
await admin("/api/v1/finance/platform-fee", { method: "PUT", body: { enabled: false, feePaise: 1000 } });
({ cart, order } = await buy([[products[0].variant_id, 1]]));
check("switched off: no fee", cart.platformFeePaise === 0 && order.platformFeePaise === 0 && order.grandTotalPaise === order.subtotalPaise - order.discountPaise);
check("shoppers and sellers can't change it", [401, 403].includes((await shop(`${AD}/api/v1/finance/platform-fee`, { method: "PUT", body: { enabled: true, feePaise: 0 } })).status) && [401, 403].includes((await seller(`${AD}/api/v1/finance/platform-fee`, { method: "PUT", body: { enabled: true, feePaise: 0 } })).status));

await tidy();
await clearLimits();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
