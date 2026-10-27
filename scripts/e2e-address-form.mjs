// End-to-end test for the checkout "Deliver to" form: PIN / location auto-fill;
// addresses keep the name,
// mobile and alternate number of the person receiving the parcel, the order's
// delivery details use them, and sellers still never see a phone number.
// Requires the demo seed and the apps (test server) against a NON-PRODUCTION
// database. Removes the addresses and order it creates.
//   ALLOW_E2E=YES node scripts/e2e-address-form.mjs
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

const shop = client(SF), seller = client(SE);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
const [me] = await sql`select s.id from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const [product] = await sql`select v.id variant_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 3 order by p.created_at limit 1`;
if (!product) throw new Error("Need a stocked live demo-seller product.");
const savedCart = (await shop("/api/v1/cart")).json?.items ?? [];
const addressIds = [], orderIds = [];
async function tidy() {
  for (const id of orderIds) {
    const qty = (await sql`select coalesce(sum(quantity), 0)::int n from order_items where order_id = ${id}`)[0].n;
    await sql`update inventory set reserved = greatest(0, reserved - ${qty}) where variant_id = ${product.variant_id}`;
    await sql`update orders set status = 'CANCELLED', shipping_address_id = null, created_at = created_at - interval '1 year' where id = ${id}`;
  }
  if (addressIds.length) await sql`delete from customer_addresses where id = any(${addressIds})`;
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  for (const item of savedCart) await shop("/api/v1/cart", { method: "POST", body: { variantId: item.variantId, quantity: item.quantity } });
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (e) => { console.error(e); tidy().finally(() => process.exit(1)); });

const list = await shop("/api/v1/addresses");
check("address list includes the shopper's name and mobile to pre-fill the form", list.status === 200 && typeof list.json?.contact?.name === "string" && !/^\+/.test(list.json.contact.phone ?? ""), JSON.stringify(list.json?.contact));

const body = { label: "Office", line1: "Flat 402, Sai Residency", line2: "Bellandur, Sakra Hospital Road", city: "Bengaluru", state: "Karnataka", postalCode: "560103",
  recipientName: "E2E Receiver", recipientPhone: "9123400001", alternatePhone: "9123400002", country: "IN", isDefault: false };
const made = await shop("/api/v1/addresses", { method: "POST", body });
if (made.json?.item?.id) addressIds.push(made.json.item.id);
check("saves name, mobile and alternate number", made.status === 201 && made.json.item.recipientName === "E2E Receiver" && made.json.item.recipientPhone === "9123400001" && made.json.item.alternatePhone === "9123400002" && made.json.item.label === "Office", JSON.stringify(made.json));
const listed = (await shop("/api/v1/addresses")).json?.items?.find((a) => a.id === made.json?.item?.id);
check("saved address comes back with the receiver's details", listed?.recipientName === "E2E Receiver" && listed?.alternatePhone === "9123400002");

const noAlt = await shop("/api/v1/addresses", { method: "POST", body: { ...body, label: "Home", alternatePhone: "" } });
if (noAlt.json?.item?.id) addressIds.push(noAlt.json.item.id);
check("alternate number is optional", noAlt.status === 201 && noAlt.json.item.alternatePhone === null, JSON.stringify(noAlt.json));
const badPhone = await shop("/api/v1/addresses", { method: "POST", body: { ...body, recipientPhone: "12345" } });
if (badPhone.json?.item?.id) addressIds.push(badPhone.json.item.id);
check("rejects a mobile number that isn't 10 digits", badPhone.status === 400, String(badPhone.status));
const badAlt = await shop("/api/v1/addresses", { method: "POST", body: { ...body, alternatePhone: "55555" } });
if (badAlt.json?.item?.id) addressIds.push(badAlt.json.item.id);
check("rejects a bad alternate number", badAlt.status === 400, String(badAlt.status));

// Auto-fill: a PIN code gives the city and state; a location gives area, city, state and PIN.
await sql`delete from rate_limit_buckets where key like '%addressLookup%'`;
const pin = await shop("/api/v1/geo?pin=560103");
check("PIN code fills city and state", pin.status === 200 && pin.json?.found?.state === "Karnataka" && /bang|beng/i.test(pin.json.found.city), JSON.stringify(pin.json));
const point = await shop("/api/v1/geo?lat=12.93521&lng=77.67664");
check("current location fills area, city, state and PIN", point.status === 200 && point.json?.found?.state === "Karnataka" && point.json.found.postalCode === "560103" && point.json.found.area.length > 3, JSON.stringify(point.json));
check("bad PIN code is rejected", (await shop("/api/v1/geo?pin=12")).status === 400);
check("location outside India is rejected", (await shop("/api/v1/geo?lat=51.5&lng=-0.12")).status === 400);
check("lookup needs a signed-in shopper", (await client(SF)("/api/v1/geo?pin=560103")).status === 401);
const policy = (await fetch(SF + "/checkout", { redirect: "manual" })).headers.get("permissions-policy") ?? "";
check("site allows its own pages to ask for location", policy.includes("geolocation=(self)"), policy);

// The order uses the receiver's name and numbers.
for (const item of savedCart) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity: 1 } });
const placed = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: made.json?.item?.id, paymentMethod: "COD", useWallet: false } });
if (placed.json?.orderId) orderIds.push(placed.json.orderId);
const [snap] = placed.json?.orderId ? await sql`select shipping_address_snapshot s from orders where id = ${placed.json.orderId}` : [];
check("order delivers to the receiver's name and mobile", snap?.s?.name === "E2E Receiver" && snap.s.phone === "9123400001" && snap.s.alternatePhone === "9123400002", JSON.stringify({ status: placed.status, snap }));

// Sellers see the name and address but no phone numbers.
const sellerOrders = JSON.stringify((await seller("/api/v1/orders")).json ?? {});
check("seller order list shows the receiver's name", sellerOrders.includes("E2E Receiver"));
check("seller order list has no phone numbers", !sellerOrders.includes("9123400001") && !sellerOrders.includes("9123400002"));
const label = JSON.stringify((await seller(`/api/v1/orders/${placed.json?.orderId}/label`)).json ?? {});
check("shipping label has no phone numbers", label.includes("E2E Receiver") && !label.includes("9123400001") && !label.includes("9123400002"), label.match(/.{80}(9123400001|9123400002).{40}/)?.[0] ?? label.slice(0, 120));

await tidy();
const left = (await sql`select count(*)::int n from customer_addresses where id = any(${addressIds})`)[0].n;
check("test addresses removed", left === 0);
console.log(`\naddress-form: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
