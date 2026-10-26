// End-to-end test for the seller courier wallet: top-up requests (max ₹500
// balance, unique payment reference), admin approve/reject, LOIMART courier
// fees paid from the wallet first with the shortfall left for the payout,
// and refunds when a parcel is cancelled. Requires the demo seed + catalogue
// seed and all three apps against a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:wallet
import { neon } from "@neondatabase/serverless";
import { rm } from "node:fs/promises";
import path from "node:path";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'checkout:%' or key like 'supportTicket:%'`;
const RUN = Date.now().toString(36).toUpperCase();
let pass = 0, fail = 0;
const check = (n, ok, x = "") => { ok ? pass++ : fail++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? "  " + x : "")); };

function client(base) {
  let cookie = "";
  const call = async (url, { method = "GET", body, form } = {}) => {
    const headers = { cookie };
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(url.startsWith("http") ? url : base + url, { method, headers, body: form ?? (body ? JSON.stringify(body) : undefined) });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  call.cookie = () => cookie;
  return call;
}
const shop = client(SF), admin = client(AD), seller = client(SE);
const adminCookie = admin.cookie, sellerCookie = seller.cookie;
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });

const [me] = await sql`select s.id, s.wallet_balance_paise from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const started = new Date();
const original = { balance: me.wallet_balance_paise, settings: (await seller("/api/v1/shipping-settings")).json?.settings ?? null,
  details: (await sql`select value from platform_settings where key = 'wallet_payment_details'`)[0]?.value ?? null };
const [product] = await sql`select v.id variant_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and v.weight_grams > 0 and v.price_paise >= 30100 and i.on_hand - i.reserved >= 3 order by p.created_at limit 1`;
if (!product) throw new Error("Need a stocked live product from the demo seller.");
const orders = [];
async function tidy() {
  for (const id of orders) { await sql`update orders set status = 'CANCELLED' where id = ${id}`; }
  if (orders.length) await sql`update inventory set reserved = greatest(0, reserved - ${orders.length}) where variant_id = ${product.variant_id}`;
  await sql`delete from seller_wallet_transactions where seller_id = ${me.id} and created_at >= ${started}`;
  // The payment screenshots (local test storage) go with the requests.
  for (const t of await sql`select proof_key from seller_wallet_top_ups where seller_id = ${me.id} and created_at >= ${started} and proof_key is not null`) {
    await rm(path.join(process.env.LOCAL_STORAGE_DIR?.trim() || path.join(process.cwd(), ".data"), t.proof_key), { force: true }).catch(() => undefined);
  }
  await sql`delete from seller_wallet_top_ups where seller_id = ${me.id} and created_at >= ${started}`;
  await sql`update sellers set wallet_balance_paise = ${original.balance} where id = ${me.id}`;
  if (original.settings) await seller("/api/v1/shipping-settings", { method: "PATCH", body: original.settings });
  if (original.details) await sql`update platform_settings set value = ${JSON.stringify(original.details)}::jsonb where key = 'wallet_payment_details'`;
  else await sql`delete from platform_settings where key = 'wallet_payment_details'`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

await sql`update sellers set wallet_balance_paise = 0 where id = ${me.id}`;
await sql`update seller_wallet_top_ups set status = 'REJECTED' where seller_id = ${me.id} and status = 'PENDING'`;
const balance = async () => (await sql`select wallet_balance_paise b from sellers where id = ${me.id}`)[0].b;

// --- top-ups (amount, UTR and a payment screenshot, which is required)
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
function topUp(amountPaise, reference, file = new Blob([PNG], { type: "image/png" })) {
  const form = new FormData();
  form.set("amountPaise", String(amountPaise)); form.set("reference", reference);
  if (file) form.set("file", file, "payment.png");
  return seller("/api/v1/wallet/top-ups", { method: "POST", form });
}
let r = await seller("/api/v1/wallet");
check("seller sees an empty wallet with ₹500 room", r.status === 200 && r.json.balancePaise === 0 && r.json.roomPaise === 50000 && r.json.maxPaise === 50000, JSON.stringify(r.json && { b: r.json.balancePaise, room: r.json.roomPaise }));
r = await topUp(60000, `E2E${RUN}A`);
check("can't ask for more than ₹500", r.status === 400, String(r.status));
r = await topUp(30000, `E2E${RUN}N`, null);
check("payment screenshot is required", r.status === 400 && /screenshot/i.test(r.json?.error?.message ?? ""), JSON.stringify(r.json));
r = await topUp(30000, `E2E${RUN}N`, new Blob(["not an image"], { type: "image/png" }));
check("only images or PDFs are accepted", r.status === 400, String(r.status));
r = await seller("/api/v1/wallet/top-ups", { method: "POST", body: { amountPaise: 30000, reference: `E2E${RUN}J` } });
check("old JSON request without a screenshot is refused", r.status === 400, String(r.status));
r = await topUp(30000, `E2E${RUN}A`);
const topA = r.json?.id;
check("seller requests a ₹300 top-up", r.status === 201 && r.json?.status === "PENDING", String(r.status));
r = await topUp(30000, `E2E${RUN}B`);
check("waiting requests count towards the ₹500 limit", r.status === 400 && /₹200/.test(r.json?.error?.message ?? ""), r.json?.error?.message);
r = await topUp(10000, `e2e${RUN}a`);
check("the same payment reference can't be sent twice", r.status === 409, String(r.status));
check("money isn't added before approval", (await balance()) === 0);
check("sellers can't approve their own top-up", [401, 403].includes((await seller(`${AD}/api/v1/wallets/top-ups/${topA}`, { method: "POST", body: { decision: "APPROVE" } })).status));
r = await admin("/api/v1/wallets");
check("admin sees the waiting request", r.json?.topUps?.some((t) => t.id === topA && t.status === "PENDING" && t.hasProof === true));
const shot = await fetch(`${AD}/api/v1/wallets/top-ups/${topA}/proof`, { headers: { cookie: adminCookie() } });
check("admin opens the payment screenshot", shot.status === 200 && shot.headers.get("content-type") === "image/png" && (await shot.arrayBuffer()).byteLength === PNG.length);
check("sellers can't open it through admin", [401, 403].includes((await seller(`${AD}/api/v1/wallets/top-ups/${topA}/proof`)).status));
check("seller opens their own screenshot", (await fetch(`${SE}/api/v1/wallet/top-ups/${topA}/proof`, { headers: { cookie: sellerCookie() } })).status === 200);
r = await admin(`/api/v1/wallets/top-ups/${topA}`, { method: "POST", body: { decision: "APPROVE" } });
check("admin approves: ₹300 added", r.status === 200 && (await balance()) === 30000, JSON.stringify(r.json));
r = await admin(`/api/v1/wallets/top-ups/${topA}`, { method: "POST", body: { decision: "APPROVE" } });
check("a request can't be approved twice", r.status === 409 && (await balance()) === 30000, String(r.status));
r = await topUp(15000, `E2E${RUN}C`);
const topC = r.json?.id;
r = await admin(`/api/v1/wallets/top-ups/${topC}`, { method: "POST", body: { decision: "REJECT" } });
check("rejecting needs a reason", r.status === 400, String(r.status));
r = await admin(`/api/v1/wallets/top-ups/${topC}`, { method: "POST", body: { decision: "REJECT", note: "Payment not received in our account" } });
const w = (await seller("/api/v1/wallet")).json;
check("seller sees the rejection reason; balance unchanged", w.topUps.some((t) => t.id === topC && t.status === "REJECTED" && t.adminNote) && w.balancePaise === 30000);
r = await topUp(15000, `E2E${RUN}C`);
check("a rejected reference can be sent again", r.status === 201, String(r.status));
await admin(`/api/v1/wallets/top-ups/${r.json?.id}`, { method: "POST", body: { decision: "REJECT", note: "Test" } });

// --- where sellers pay: LOIMART's bank details, set in Admin
r = await admin("/api/v1/wallets/payment-details", { method: "PUT", body: { accountName: "LOIMART Test", accountNumber: "1234567890", ifsc: "BADIFSC", upiId: "" } });
check("a wrong IFSC is refused", r.status === 400, String(r.status));
r = await admin("/api/v1/wallets/payment-details", { method: "PUT", body: { accountName: "LOIMART Test Account", bankName: "Test Bank", accountNumber: "1234567890", ifsc: "test0001234", upiId: "loimart.test@okaxis", note: "Use your store name as the remark" } });
check("admin saves the bank details for top-ups", r.status === 200 && r.json?.details?.ifsc === "TEST0001234", String(r.status));
r = await seller("/api/v1/wallet");
check("sellers see them on their Wallet page", r.json?.paymentDetails?.accountNumber === "1234567890" && r.json.paymentDetails.upiId === "loimart.test@okaxis");
check("sellers can't change them", [401, 403].includes((await seller(`${AD}/api/v1/wallets/payment-details`, { method: "PUT", body: { upiId: "thief@okaxis" } })).status));

// --- courier fees: LOIMART books the parcel, the wallet pays first
await seller("/api/v1/shipping-settings", { method: "PATCH", body: { shipWith: "LOIMART", preferredProvider: "MANUAL", pickup: original.settings?.pickup ?? { name: "Demo Store", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "IN" } } });
const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "7 Park Street", city: "Kolkata", state: "West Bengal", postalCode: "700016", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
async function orderAndBook() {
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity: 1 } });
  const o = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
  if (!o.json?.orderId) throw new Error("Checkout failed: " + o.status + " " + JSON.stringify(o.json));
  orders.push(o.json.orderId);
  return { orderId: o.json.orderId, booked: await seller("/api/v1/shipments", { method: "POST", body: { orderId: o.json.orderId } }) };
}
// Only LOIMART ships: a seller who chose "own courier" earlier, or tries to now, still gets LOIMART.
r = await seller("/api/v1/shipping-settings", { method: "PATCH", body: { shipWith: "SELF", preferredProvider: "MANUAL", pickup: original.settings?.pickup ?? { name: "Demo Store", phone: "9876543210", line1: "12 MG Road", city: "Bengaluru", state: "Karnataka", postalCode: "560001", country: "IN" } } });
check("sellers can't switch to their own courier", (await seller("/api/v1/shipping-settings")).json?.settings?.shipWith === "LOIMART");
await sql`update seller_settings set shipping_settings = jsonb_set(shipping_settings, '{shipWith}', '"SELF"') where seller_id = ${me.id}`;
let { booked } = await orderAndBook();
const ship1 = booked.json?.shipment;
const [s1] = await sql`select shipping_fee_paise fee, wallet_paid_paise paid, shipped_by from shipments where id = ${ship1?.id}`;
check("LOIMART books the courier and charges a fee", booked.status < 300 && s1?.shipped_by === "LOIMART" && s1.fee > 0, JSON.stringify({ status: booked.status, s1 }));
check("the wallet pays the whole fee when it can", s1?.paid === Math.min(30000, s1?.fee ?? 0) && (await balance()) === 30000 - s1.paid, JSON.stringify({ s1, bal: await balance() }));
const [charge] = await sql`select amount_paise, balance_after_paise from seller_wallet_transactions where shipment_id = ${ship1?.id} and type = 'COURIER_CHARGE'`;
check("the charge is in the wallet history", charge?.amount_paise === -s1.paid && charge.balance_after_paise === 30000 - s1.paid);

// Short wallet: what it holds goes to the fee, the rest stays for the payout.
await sql`update sellers set wallet_balance_paise = 1000 where id = ${me.id}`;
({ booked } = await orderAndBook());
const ship2 = booked.json?.shipment;
const [s2] = await sql`select shipping_fee_paise fee, wallet_paid_paise paid from shipments where id = ${ship2?.id}`;
check("a short wallet pays what it has; the rest is left for the payout", s2?.paid === 1000 && (await balance()) === 0 && s2.fee - s2.paid > 0, JSON.stringify(s2));
const [line] = await sql`select (select sh.shipping_fee_paise - sh.wallet_paid_paise from shipments sh where sh.id = ${ship2?.id}) from_payout`;
check("the payout only takes the part the wallet didn't cover", line.from_payout === s2.fee - 1000, JSON.stringify(line));

// Cancelled parcel: the wallet part comes back once.
r = await admin(`/api/v1/shipments/${ship1?.id}`, { method: "PATCH", body: { status: "CANCELLED", notes: "E2E cancel" } });
const [after] = await sql`select wallet_paid_paise paid from shipments where id = ${ship1?.id}`;
check("cancelling a parcel returns its fee to the wallet", r.status === 200 && (await balance()) === s1.paid && after.paid === 0, JSON.stringify({ status: r.status, bal: await balance() }));
const refunds = await sql`select count(*)::int n from seller_wallet_transactions where shipment_id = ${ship1?.id} and type = 'COURIER_REFUND'`;
check("the refund is recorded once", refunds[0].n === 1);
r = await seller("/api/v1/wallet");
check("seller's history shows charges, refunds and top-ups", ["TOP_UP", "COURIER_CHARGE", "COURIER_REFUND"].every((t) => r.json?.history?.some((h) => h.type === t)) && r.json.history.some((h) => h.orderNumber));
check("customers can't see a seller wallet", [401, 403].includes((await shop(`${SE}/api/v1/wallet`)).status));
const audits = await sql`select action from audit_logs where entity_id = ${topA}`;
check("top-ups are audited", ["WALLET_TOP_UP_REQUESTED", "WALLET_TOP_UP_APPROVED"].every((a) => audits.some((x) => x.action === a)));

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
