// End-to-end test for GST and invoices: Admin sets a category's HSN code and
// GST rate (with the ₹2,500 clothing rule) and LOIMART's company details; an
// order saves the GST on each line; when the courier picks the parcel up, the
// seller's tax invoice is issued (numbered per seller per financial year,
// CGST+SGST or IGST by state); the customer, the seller and Admin can open it
// (nobody else can); a parcel that comes back gets a credit note. Requires the
// demo seed + catalogue seed and all three apps against a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:invoices
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'checkout:%' or key like 'productCreate:%'`;
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
    return { status: res.status, json: await res.json().catch(() => null), text: "" };
  };
}
const seller = client(SE), admin = client(AD), shop = client(SF), stranger = client(SF);
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });

const [me] = await sql`select s.id, s.tax_identity_type, s.business_state, ss.shipping_settings from sellers s left join seller_settings ss on ss.seller_id = s.id join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const [product] = await sql`select v.id variant_id, v.price_paise, p.id product_id, p.category_id, p.hsn_code, p.gst_rate_bps from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 2 and v.price_paise between 10000 and 200000 order by p.created_at desc limit 1`;
if (!product) throw new Error("Need a stocked live product (₹100–₹2,000) from the demo seller.");
const [category] = await sql`select id, hsn_code, gst_rate_bps, gst_price_limit_paise, gst_rate_above_limit_bps from categories where id = ${product.category_id}`;
const [companyBefore] = await sql`select value from platform_settings where key = 'company_details'`;
const orders = [];
async function tidy() {
  await sql`update categories set hsn_code = ${category.hsn_code}, gst_rate_bps = ${category.gst_rate_bps}, gst_price_limit_paise = ${category.gst_price_limit_paise}, gst_rate_above_limit_bps = ${category.gst_rate_above_limit_bps} where id = ${category.id}`;
  await sql`update products set hsn_code = ${product.hsn_code}, gst_rate_bps = ${product.gst_rate_bps} where id = ${product.product_id}`;
  if (companyBefore) await sql`update platform_settings set value = ${companyBefore.value} where key = 'company_details'`;
  else await sql`delete from platform_settings where key = 'company_details'`;
  for (const id of orders) await sql`update orders set status = 'CANCELLED' where id = ${id}`;
  // The first test parcel never got delivered: give back the stock checkout reserved for it.
  if (orders[0]) await sql`update inventory set reserved = greatest(0, reserved - 2) where variant_id = ${product.variant_id}`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

// --- Admin: category GST and company details
let r = await admin("/api/v1/catalog/gst", { method: "PUT", body: { items: [{ categoryId: category.id, hsnCode: "6204", gstRateBps: 1200, priceLimitPaise: null, rateAboveLimitBps: null }] } });
check("12% is refused (no longer a GST rate)", r.status === 400, String(r.status));
r = await admin("/api/v1/catalog/gst", { method: "PUT", body: { items: [{ categoryId: category.id, hsnCode: "6204", gstRateBps: 500, priceLimitPaise: 250000, rateAboveLimitBps: 1800 }] } });
check("Admin sets a category's HSN code and GST rate (5%, 18% above ₹2,500)", r.status === 200, JSON.stringify(r.json?.error ?? ""));
r = await admin("/api/v1/catalog/gst");
const row = r.json?.items?.find((c) => c.id === category.id);
check("…and sees it in GST & HSN", row?.hsnCode === "6204" && row.gstRateBps === 500 && row.priceLimitPaise === 250000);
check("sellers can't change GST rates", [401, 403].includes((await seller(`${AD}/api/v1/catalog/gst`, { method: "PUT", body: { items: [] } })).status));
r = await seller("/api/v1/categories");
check("the seller's product form gets the category's GST", r.json?.items?.find((c) => c.id === category.id)?.gst?.hsnCode === "6204");

r = await admin("/api/v1/finance/company", { method: "PUT", body: { legalName: "LOIMART Test Pvt Ltd", tradeName: "LOIMART", gstin: "BAD", address: "1 Test Road, Kakinada, Andhra Pradesh 533001", state: "Andhra Pradesh" } });
check("an invalid GSTIN is refused", r.status === 400);
r = await admin("/api/v1/finance/company", { method: "PUT", body: { legalName: "LOIMART Test Pvt Ltd", tradeName: "LOIMART", gstin: "37ABCDE1234F1Z5", pan: "ABCDE1234F", address: "1 Test Road, Kakinada, Andhra Pradesh 533001", state: "Andhra Pradesh" } });
check("Admin saves LOIMART's company details", r.status === 200, JSON.stringify(r.json?.error ?? ""));

// --- an order saves GST on its lines
const sellerState = me.shipping_settings?.pickup?.state || me.business_state;
const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "12 MG Road", city: "Bengaluru", state: sellerState === "Karnataka" ? "Kerala" : "Karnataka", postalCode: sellerState === "Karnataka" ? "682001" : "560001", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity: 2 } });
r = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
const orderId = r.json?.orderId;
if (!orderId) throw new Error("Checkout failed: " + r.status + " " + JSON.stringify(r.json));
orders.push(orderId);
const [line] = await sql`select hsn_code, gst_rate_bps from order_items where order_id = ${orderId}`;
check("the order line keeps its HSN code and GST rate", line.hsn_code === "6204" && line.gst_rate_bps === 500, JSON.stringify(line));
r = await shop(`/api/v1/orders/${orderId}`);
check("no invoice before the parcel ships", r.json?.order?.invoices?.length === 0);

// --- courier picks up: the seller's invoice is issued
const [shipment] = await sql`insert into shipments (order_id, seller_id, status, shipped_by, awb) values (${orderId}, ${me.id}, 'CREATED', 'LOIMART', ${"E2EINV" + Date.now()}) returning id`;
r = await admin(`/api/v1/shipments/${shipment.id}`, { method: "PATCH", body: { status: "PICKED_UP" } });
check("courier pickup accepted", r.status === 200, String(r.status));
const invoices = await sql`select * from invoices where order_id = ${orderId}`;
const inv = invoices[0];
const expectKind = me.tax_identity_type === "GSTIN" ? "TAX_INVOICE" : "BILL_OF_SUPPLY";
check("one invoice is issued for the seller", invoices.length === 1 && inv.kind === expectKind && inv.seller_id === me.id, inv && inv.kind);
check("numbered LOI/2627/… (16 characters at most)", /^(LOI|LBS)\/\d{4}\/\d{6}$/.test(inv?.number ?? "") && inv.number.length <= 16, inv?.number);
const gross = product.price_paise * 2;
check("invoice total = what the customer pays for the lines", inv?.total_paise === gross, `${inv?.total_paise} vs ${gross}`);
if (expectKind === "TAX_INVOICE") {
  check("taxable value + GST = total (5%, other state → IGST)", inv.taxable_paise + inv.igst_paise === inv.total_paise && inv.cgst_paise === 0 && Math.abs(inv.igst_paise - Math.round(gross - gross / 1.05)) <= 1, JSON.stringify({ t: inv.taxable_paise, igst: inv.igst_paise }));
}
check("marked TEST on a test server", inv?.is_test === true);
check("shows LOIMART's GSTIN as the e-commerce operator", inv?.details?.marketplace?.gstin === "37ABCDE1234F1Z5");
await sql`update shipments set status = 'CREATED' where id = ${shipment.id}`;
await sql`delete from shipment_events where shipment_id = ${shipment.id}`;
r = await admin(`/api/v1/shipments/${shipment.id}`, { method: "PATCH", body: { status: "PICKED_UP" } });
check("never issued twice for the same parcel", (await sql`select count(*)::int n from invoices where order_id = ${orderId}`)[0].n === 1);

// --- who can see it
r = await shop(`/api/v1/orders/${orderId}`);
const listed = r.json?.order?.invoices?.[0];
check("the customer sees it on their order", listed?.id === inv.id && listed.number === inv.number);
r = await shop(`/api/v1/orders/${orderId}/invoices/${inv.id}`);
check("…and can open it", r.status === 200 && r.json?.invoice?.details?.lines?.[0]?.hsnCode === "6204");
check("another shopper can't", [401, 403, 404].includes((await stranger(`/api/v1/orders/${orderId}/invoices/${inv.id}`)).status));
r = await seller("/api/v1/orders");
check("the seller sees it on the order", r.json?.items?.find((o) => o.id === orderId)?.invoices?.some((d) => d.id === inv.id));
check("…and can open it", (await seller(`/api/v1/invoices/${inv.id}`)).status === 200);
r = await admin(`/api/v1/finance/invoices?q=${encodeURIComponent(inv.number)}`);
check("Admin finds it by number", r.json?.items?.some((x) => x.id === inv.id));

// --- the parcel comes back: credit note
r = await admin(`/api/v1/shipments/${shipment.id}`, { method: "PATCH", body: { status: "RETURNED" } });
const [credit] = await sql`select * from invoices where order_id = ${orderId} and kind = 'CREDIT_NOTE'`;
check("an undelivered parcel gets a credit note", r.status === 200 && credit?.original_invoice_id === inv.id && credit.total_paise === inv.total_paise, String(r.status));
check("…in its own series (LCN/…) against the invoice", /^LCN\/\d{4}\/\d{6}$/.test(credit?.number ?? "") && credit.details?.original?.number === inv.number, credit?.number);

// --- a customer return: credit note for the returned piece only
await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity: 2 } });
r = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
const order2 = r.json?.orderId;
if (!order2) throw new Error("Second checkout failed: " + JSON.stringify(r.json));
orders.push(order2);
const [ship2] = await sql`insert into shipments (order_id, seller_id, status, shipped_by, awb) values (${order2}, ${me.id}, 'CREATED', 'LOIMART', ${"E2EINV2" + Date.now()}) returning id`;
for (const status of ["PICKED_UP", "IN_TRANSIT", "DELIVERED"]) await admin(`/api/v1/shipments/${ship2.id}`, { method: "PATCH", body: { status } });
const [item2] = await sql`select id from order_items where order_id = ${order2}`;
r = await shop(`/api/v1/orders/${order2}/returns`, { method: "POST", body: { items: [{ orderItemId: item2.id, quantity: 1, reason: "Size doesn't fit" }], reason: "Size doesn't fit" } });
const [ret] = await sql`select id from returns where order_id = ${order2}`;
check("customer asks to return 1 of 2 pieces", r.status === 201 && Boolean(ret), String(r.status) + JSON.stringify(r.json?.error ?? ""));
for (const status of ["APPROVED", "PICKUP_SCHEDULED"]) await seller(`/api/v1/returns/${ret?.id}`, { method: "POST", body: { status } });
check("no credit note until the seller receives it", (await sql`select count(*)::int n from invoices where order_id = ${order2} and kind = 'CREDIT_NOTE'`)[0].n === 0);
r = await seller(`/api/v1/returns/${ret?.id}`, { method: "POST", body: { status: "RECEIVED" } });
const [inv2] = await sql`select * from invoices where order_id = ${order2} and kind <> 'CREDIT_NOTE'`;
const [cn2] = await sql`select * from invoices where order_id = ${order2} and kind = 'CREDIT_NOTE'`;
check("received back: credit note for the returned piece only", r.status === 200 && cn2?.details?.lines?.[0]?.quantity === 1 && cn2.total_paise === Math.round(inv2.total_paise / 2) && cn2.details.reason === "Goods returned by the customer", JSON.stringify({ status: r.status, total: cn2?.total_paise }));
await sql`update inventory set on_hand = on_hand - 1 where variant_id = ${product.variant_id}`; // undo the restock of the test return

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
