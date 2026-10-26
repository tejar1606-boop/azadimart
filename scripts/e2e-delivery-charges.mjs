// End-to-end test for who pays delivery: orders under ₹301 (items after
// offers) pay the courier charge at checkout and the seller pays no courier
// fee; from ₹301 delivery is free for the shopper and the seller pays the
// courier. Return pickups: LOIMART pays 40%, the seller 60% (a charge on
// their next payout). Requires the demo seed and the apps (test server)
// against a NON-PRODUCTION database. Restores everything it changes.
//   ALLOW_E2E=YES pnpm e2e:delivery-charges
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'checkout:%' or key like 'login:%' or key like 'ip:%'`;
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };
function client(base) {
  let cookie = "";
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  return async (path, { method = "GET", body } = {}) => {
    const headers = { cookie, origin: base, "x-forwarded-for": ip };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = [...cookie.split("; ").filter((c) => c && !set.some((s) => s.startsWith(c.split("=")[0] + "="))), ...set.map((c) => c.split(";")[0])].join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
}

// The LOIMART rate card (packages/shared/src/shipping-rates.ts).
const RATES = { local: [3500, 2500], regional: [4500, 3500], national: [6000, 4500] };
const fee = (grams, zone, cod) => RATES[zone][0] + (Math.max(1, Math.ceil(grams / 500)) - 1) * RATES[zone][1] + (cod ? 2500 : 0);

const shop = client(SF), seller = client(SE);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
const [me] = await sql`select s.id, s.wallet_balance_paise from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const [product] = await sql`select v.id variant_id, v.price_paise, v.weight_grams from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and v.weight_grams between 1 and 400 and i.on_hand - i.reserved >= 5 order by p.created_at limit 1`;
if (!product) throw new Error("Need a stocked live demo-seller product weighing under 400 g.");
const started = new Date();
const settings = (await seller("/api/v1/shipping-settings")).json?.settings ?? null;
const pickup = { name: "Demo Store", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "IN" };
const orders = [];
let onHandBack = 0;
async function tidy() {
  for (const id of orders) {
    for (const r of await sql`select id from returns where order_id = ${id}`) {
      await sql`delete from invoices where source_key = ${"RETURN:" + r.id}`.catch(() => undefined);
      await sql`delete from seller_charges where kind = 'RETURN_SHIPPING' and reference_id = ${r.id}`;
      await sql`delete from audit_logs where entity_type = 'return' and entity_id = ${r.id}`;
    }
    await sql`delete from inventory_movements where reference_type = 'CUSTOMER_RETURN' and reference_id = ${id}`;
    await sql`delete from returns where order_id = ${id}`;
    await sql`update orders set status = 'CANCELLED', created_at = created_at - interval '1 year' where id = ${id}`;
  }
  const qty = (await sql`select coalesce(sum(quantity), 0)::int n from order_items where order_id = any(${orders})`)[0].n;
  await sql`update inventory set reserved = greatest(0, reserved - ${qty}), on_hand = on_hand - ${onHandBack} where variant_id = ${product.variant_id}`;
  await sql`update product_variants set price_paise = ${product.price_paise} where id = ${product.variant_id}`;
  await sql`delete from seller_wallet_transactions where seller_id = ${me.id} and created_at >= ${started}`;
  await sql`update sellers set wallet_balance_paise = ${me.wallet_balance_paise} where id = ${me.id}`;
  if (settings) await seller("/api/v1/shipping-settings", { method: "PATCH", body: settings });
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });

// A ₹199 item, shipped by LOIMART from Bengaluru to Kolkata (rest of India). Wallet empty so fees go to the payout.
await sql`update product_variants set price_paise = 19900 where id = ${product.variant_id}`;
await sql`update sellers set wallet_balance_paise = 0 where id = ${me.id}`;
await seller("/api/v1/shipping-settings", { method: "PATCH", body: { shipWith: "LOIMART", preferredProvider: "MANUAL", pickup: settings?.pickup ?? pickup } });
const from = settings?.pickup ?? pickup;
const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "7 Park Street", city: "Kolkata", state: "West Bengal", postalCode: "700016", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
const zone = from.state.trim().toLowerCase() === "west bengal" ? (from.city.trim().toLowerCase() === "kolkata" ? "local" : "regional") : "national";

async function order(quantity) {
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity } });
  const quote = (await shop(`/api/v1/checkout/delivery?addressId=${addressId}`)).json;
  const placed = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD", useWallet: false } });
  if (!placed.json?.orderId) throw new Error("Checkout failed: " + JSON.stringify(placed.json));
  orders.push(placed.json.orderId);
  return { quote, placed: placed.json };
}

// Under ₹301: the shopper pays delivery.
const a = await order(1);
const expectA = fee(product.weight_grams, zone, true);
check("quote: courier charge to the address", a.quote?.feePaise === expectA && a.quote.freeFromPaise === 30100, JSON.stringify({ quote: a.quote, expectA }));
check("₹199 order: shopper pays delivery", a.placed.shippingPaise === expectA, JSON.stringify(a.placed));
check("total includes delivery", a.placed.grandTotalPaise === 19900 + expectA + a.placed.platformFeePaise);
let booked = await seller("/api/v1/shipments", { method: "POST", body: { orderId: a.placed.orderId } });
let [ship] = await sql`select shipping_fee_paise fee, shipped_by from shipments where order_id = ${a.placed.orderId}`;
check("seller pays no courier fee (shopper paid)", booked.status < 300 && ship?.shipped_by === "LOIMART" && ship.fee === 0, JSON.stringify({ status: booked.status, ship }));
const events = await sql`select description from shipment_events e join shipments s on s.id = e.shipment_id where s.order_id = ${a.placed.orderId}`;
check("tracking note says the customer paid delivery", events.some((e) => e.description?.includes("Delivery paid by the customer")));
check("nothing taken from the seller's wallet", (await sql`select count(*)::int n from seller_wallet_transactions where seller_id = ${me.id} and created_at >= ${started}`)[0].n === 0);

// ₹301 and over: free for the shopper, the seller pays the courier.
const b = await order(2);
check("₹398 order: free delivery", b.placed.shippingPaise === 0 && b.placed.grandTotalPaise === 39800 + b.placed.platformFeePaise, JSON.stringify(b.placed));
booked = await seller("/api/v1/shipments", { method: "POST", body: { orderId: b.placed.orderId } });
[ship] = await sql`select shipping_fee_paise fee from shipments where order_id = ${b.placed.orderId}`;
check("seller pays the courier fee", booked.status < 300 && ship?.fee === fee(product.weight_grams * 2, zone, true), JSON.stringify({ status: booked.status, ship }));

// Exactly ₹301 is free.
await sql`update product_variants set price_paise = 30100 where id = ${product.variant_id}`;
const c = await order(1);
check("exactly ₹301: free delivery", c.placed.shippingPaise === 0);

// A return on the free-delivery order: LOIMART 40%, seller 60%.
await sql`update orders set status = 'DELIVERED', delivered_at = now() - interval '1 day' where id = ${b.placed.orderId}`;
await sql`update payments set status = 'CAPTURED' where order_id = ${b.placed.orderId}`;
const [line] = await sql`select id from order_items where order_id = ${b.placed.orderId}`;
const r = await shop(`/api/v1/orders/${b.placed.orderId}/returns`, { method: "POST", body: { items: [{ orderItemId: line.id, quantity: 1 }], reason: "Size or fit issue" } });
const retId = r.json?.returns?.[0]?.id;
for (const status of ["APPROVED", "PICKUP_SCHEDULED", "RECEIVED"]) await seller(`/api/v1/returns/${retId}`, { method: "POST", body: { status } });
onHandBack = 1;
const pickupFee = fee(product.weight_grams, zone, false);
const loimart = Math.round(pickupFee * 0.4);
const [ret] = await sql`select status, return_shipping_fee_paise fee from returns where id = ${retId}`;
check("return received; pickup courier charge saved", ret?.status === "RECEIVED" && ret.fee === pickupFee, JSON.stringify({ ret, pickupFee }));
const charges = await sql`select amount_paise, base_paise, gst_paise, status, description from seller_charges where kind = 'RETURN_SHIPPING' and reference_id = ${retId}`;
check("seller charged 60% from the next payout", charges.length === 1 && charges[0].amount_paise === pickupFee - loimart && charges[0].status === "PENDING", JSON.stringify(charges));
check("charge splits out the 18% GST", charges[0] && charges[0].base_paise + charges[0].gst_paise === charges[0].amount_paise && charges[0].gst_paise > 0);
const listed = (await seller("/api/v1/returns?status=ALL")).json?.items?.find((x) => x.id === retId);
check("seller Returns shows the pickup charge", listed?.returnShippingFeePaise === pickupFee);
const audit = await sql`select metadata from audit_logs where entity_type = 'return' and entity_id = ${retId} and metadata->>'to' = 'RECEIVED'`;
check("split is in the audit log", audit[0]?.metadata?.returnShipping?.loimartPaise === loimart);

await tidy();
check("test data removed", (await sql`select count(*)::int n from returns where order_id = any(${orders})`)[0].n === 0
  && (await sql`select price_paise from product_variants where id = ${product.variant_id}`)[0].price_paise === product.price_paise);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
