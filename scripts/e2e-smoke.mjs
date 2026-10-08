// End-to-end smoke test for checkout, cancellation and refunds.
// Requires: demo seed (pnpm db:seed:demo), storefront and admin running
// against the same NON-PRODUCTION database. Writes test orders and coupons.
//   ALLOW_E2E=YES STOREFRONT_URL=http://localhost:3000 ADMIN_URL=http://localhost:3002 pnpm e2e:smoke
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E smoke test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E smoke test (it writes test data).");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const PASSWORD = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  " + extra : "")); };
function client(base) {
  let cookie = "";
  return async (path, { method = "GET", body, raw } = {}) => {
    const res = await fetch(base + path, { method, headers: { "content-type": "application/json", origin: base, cookie }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
}
const shop = client(SF), admin = client(AD), anon = client(SF);
const [{ variant_id: variantId }] = await sql`select v.id variant_id, p.seller_id from product_variants v join products p on p.id=v.product_id where v.sku='DEMO-KITCHEN-001'`;
const stock = async () => (await sql`select on_hand, reserved from inventory where variant_id=${variantId}`)[0];
const before = await stock();

// auth + validation
check("unauthenticated checkout -> 401", (await anon("/api/v1/checkout", { method: "POST", body: { shippingAddressId: crypto.randomUUID() } })).status === 401);
let r = await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PASSWORD } });
check("customer login", r.status === 200, String(r.status));
r = await shop("/api/v1/cart", { method: "POST", body: { variantId: "not-a-uuid", quantity: 1 } });
check("invalid input -> 400 VALIDATION_ERROR", r.status === 400 && r.json?.error?.code === "VALIDATION_ERROR", JSON.stringify(r.json?.error?.code));
r = await shop("/api/v1/cart", { method: "POST", raw: "{bad json" });
check("malformed JSON -> 400", r.status === 400, String(r.status));

// admin creates coupon
r = await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PASSWORD } });
check("admin login", r.status === 200, String(r.status));
const code = "E2E" + Date.now().toString().slice(-8);
r = await admin("/api/v1/coupons", { method: "POST", body: { code, title: "E2E 10% off", discountType: "PERCENTAGE", discountValue: 10, startsAt: new Date(Date.now() - 60000).toISOString(), usageLimit: 5 } });
check("admin creates coupon", r.status === 200 || r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));

// cart + address
r = await shop("/api/v1/cart", { method: "POST", body: { variantId, quantity: 2 } });
check("add 2 to cart", r.status === 200 || r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
r = await shop("/api/v1/addresses", { method: "POST", body: { line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001", isDefault: true } });
check("save address (transaction)", r.status === 200 || r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const addressId = r.json?.address?.id ?? r.json?.item?.id ?? r.json?.id;

// checkout
r = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, couponCode: code, paymentMethod: "COD" } });
check("COD checkout with coupon (transaction)", r.status === 201, r.status + " " + JSON.stringify(r.json?.error ?? ""));
const order = r.json ?? {};
check("discount = 10% of 2 x ₹1,299", order.subtotalPaise === 259800 && order.discountPaise === 25980 && order.grandTotalPaise === 233820, JSON.stringify({ s: order.subtotalPaise, d: order.discountPaise, t: order.grandTotalPaise }));
let s = await stock();
check("inventory reserved +2", s.reserved === before.reserved + 2, JSON.stringify(s));
const [cp] = await sql`select usage_count from coupons where code=${code}`;
check("coupon usage counted", cp?.usage_count === 1, JSON.stringify(cp));
check("cart emptied", (await sql`select count(*)::int n from cart_items ci join carts c on c.id=ci.cart_id join customers cu on cu.id=c.customer_id join users u on u.id=cu.user_id where u.email='demo.customer@azadimart.test'`)[0].n === 0);
r = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
check("second submit of empty cart rejected (no duplicate order)", r.status === 422, String(r.status));

// view
r = await shop("/api/v1/orders/" + order.orderId);
check("order detail API", r.status === 200 && r.json?.order?.orderNumber === order.orderNumber, String(r.status));
r = await shop("/api/v1/orders/" + order.orderId + "/tracking");
check("order tracking API", r.status === 200, String(r.status));
const page = await fetch(SF + "/account/orders/" + order.orderId);
check("order detail page renders", page.status === 200, String(page.status));

// cancel
r = await shop("/api/v1/orders/" + order.orderId + "/cancel", { method: "POST", body: { reason: "E2E test" } });
check("cancel order (transaction)", r.status === 200 && r.json?.status === "CANCELLED", r.status + " " + JSON.stringify(r.json?.error ?? r.json?.status));
s = await stock();
check("inventory released", s.reserved === before.reserved, JSON.stringify(s));
const [cp2] = await sql`select usage_count from coupons where code=${code}`;
check("coupon usage returned", cp2?.usage_count === 0, JSON.stringify(cp2));
r = await shop("/api/v1/orders/" + order.orderId + "/cancel", { method: "POST", body: {} });
check("double cancel rejected", r.status === 409, String(r.status));

// refunds (admin) on COD payment
const [pay] = await sql`select id from payments where order_id=${order.orderId}`;
if (!pay) { console.log("FAIL payment row missing; skipping refund checks"); process.exit(1); }
r = await admin("/api/v1/payments/refunds", { method: "POST", body: { paymentId: pay.id, amountPaise: 1000, idempotencyKey: "e2e-" + code, manual: true } });
check("COD manual refund request (was SQL error)", r.status === 202, r.status + " " + JSON.stringify(r.json?.error ?? ""));
r = await admin("/api/v1/payments/refunds", { method: "POST", body: { paymentId: pay.id, amountPaise: 1000, idempotencyKey: "e2e-" + code, manual: true } });
check("refund idempotent replay", r.status === 200 && r.json?.idempotent === true, String(r.status));
r = await admin("/api/v1/payments/refunds", { method: "POST", body: { paymentId: pay.id, amountPaise: 999999999, idempotencyKey: "e2e2-" + code, manual: true } });
check("over-refund rejected", r.status === 409, String(r.status));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
