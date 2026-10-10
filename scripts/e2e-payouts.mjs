// End-to-end test for automatic seller payouts: bank account rules, Cash on
// Delivery counted as paid on delivery, 7-day wait after delivery, holds
// (unverified bank, admin hold, open return), commission-free first 3 months
// then 5% + GST, TCS/TDS, partial returns, a bank rejecting the transfer,
// no double payments, alerts and access. Uses test mode (no money moves).
// Requires the demo seed + catalogue seed and all three apps against a
// NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:payouts
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
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
const shop = client(SF), admin = client(AD), seller = client(SE), anon = client(AD);
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });

const [me] = await sql`select s.id, s.approved_at, s.payout_hold_reason, s.tax_identity_type from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const [product] = await sql`select v.id variant_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved > 8 order by p.created_at limit 1`;
if (!product) throw new Error("Need a stocked live product from the demo seller.");
const pct = (paise, bps) => Math.round((paise * bps) / 10000);
const expectedNet = (gross, commissionBps) => { const c = pct(gross, commissionBps); return gross - c - pct(c, 1800) - (me.tax_identity_type === "GSTIN" ? pct(gross, 50) : 0) - pct(gross, 10); };
const restore = async () => {
  await sql`update sellers set approved_at = ${me.approved_at}, payout_hold_reason = ${me.payout_hold_reason} where id = ${me.id}`;
};
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); restore().finally(() => process.exit(1)); });

const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "21 Residency Road", city: "Bengaluru", state: "Karnataka", postalCode: "560025", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
const orders = [];
let deliveredUnits = 0;
async function deliveredOrder(quantity) {
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity } });
  const r = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
  if (!r.json?.orderId) throw new Error("Checkout failed: " + r.status + " " + JSON.stringify(r.json?.error));
  orders.push(r.json.orderId);
  const [shipment] = await sql`insert into shipments (order_id, seller_id, status, awb) values (${r.json.orderId}, ${me.id}, 'OUT_FOR_DELIVERY', ${"E2EPAY" + Date.now()}) returning id`;
  const d = await seller(`/api/v1/shipments/${shipment.id}`, { method: "PATCH", body: { status: "DELIVERED" } });
  if (d.status !== 200) throw new Error("Delivery failed: " + d.status + " " + JSON.stringify(d.json?.error));
  deliveredUnits += quantity;
  const [o] = await sql`select o.id, o.order_number, (select unit_price_paise from order_items i where i.order_id = o.id limit 1) unit, o.status, o.delivered_at, (select status from payments p where p.order_id = o.id limit 1) payment from orders o where o.id = ${r.json.orderId}`;
  return o;
}
const age = (orderId, days) => sql`update orders set delivered_at = now() - make_interval(days => ${days}) where id = ${orderId}`;
const run = () => admin("/api/cron/payouts", { method: "POST" });
const payoutFor = async (orderId) => (await sql`select p.* from payouts p join payout_items pi on pi.payout_id = p.id join order_items oi on oi.id = pi.order_item_id where oi.order_id = ${orderId} limit 1`)[0];
const itemsFor = (orderId) => sql`select pi.* from payout_items pi join order_items oi on oi.id = pi.order_item_id where oi.order_id = ${orderId}`;
const alerts = async (kind) => ((await seller("/api/v1/notifications")).json?.items ?? []).filter((n) => n.kind === kind);

// --- bank account
let r = await seller("/api/v1/bank-account", { method: "POST", body: { accountHolderName: "Bharat Demo Store", accountNumber: "50100123456789", confirmAccountNumber: "50100123456789", ifsc: "HDFC1001234" } });
check("invalid IFSC rejected", r.status === 400, String(r.status));
r = await seller("/api/v1/bank-account", { method: "POST", body: { accountHolderName: "Bharat Demo Store", accountNumber: "50100123456789", confirmAccountNumber: "50100123456780", ifsc: "HDFC0001234" } });
check("mismatched account numbers rejected", r.status === 400, String(r.status));
r = await seller("/api/v1/bank-account", { method: "POST", body: { accountHolderName: "Bharat Demo Store", accountNumber: "5010 0123 456789", confirmAccountNumber: "50100123456789", ifsc: "hdfc0001234" } });
check("seller adds a bank account (needs verification)", r.status === 201 && r.json?.bankAccount?.status === "PENDING" && r.json.bankAccount.last4 === "6789" && r.json.bankAccount.ifsc === "HDFC0001234", r.status + " " + JSON.stringify(r.json?.error ?? r.json?.bankAccount));
// Anything the demo seller already had waiting goes into its own payout first, so the checks below see only this test's orders.
await run();
const [stored] = await sql`select account_number_encrypted e, account_number_last4 l from seller_bank_accounts where seller_id = ${me.id} and is_primary`;
check("account number stored encrypted, never in plain text", stored.l === "6789" && stored.e.startsWith("v1:") && !stored.e.includes("50100123456789"));

// --- free period: delivered COD order counts as paid; waits 7 days
await sql`update sellers set approved_at = now() - interval '1 month', payout_hold_reason = null where id = ${me.id}`;
const o1 = await deliveredOrder(2);
check("delivery marks the order delivered and the COD payment collected", o1.status === "DELIVERED" && o1.delivered_at && o1.payment === "CAPTURED", JSON.stringify(o1));
let mine = (await seller("/api/v1/payouts")).json;
const up1 = mine?.upcoming?.find((u) => u.orderNumber === o1.order_number);
const gross1 = o1.unit * 2;
check("seller sees it as upcoming, payable 7 days after delivery", up1 && Math.abs(new Date(up1.eligibleAt) - new Date(o1.delivered_at) - 7 * 864e5) < 1000, JSON.stringify(up1 && { eligibleAt: up1.eligibleAt }));
check("commission-free in the first 3 months", mine?.commission?.isFreeNow === true && up1?.commissionPaise === 0 && up1.netPaise === expectedNet(gross1, 0), JSON.stringify(up1 && { c: up1.commissionPaise, net: up1.netPaise, want: expectedNet(gross1, 0) }));
await run();
check("not paid before 7 days", !(await payoutFor(o1.id)));

// --- 7 days later, but the bank account isn't verified yet → on hold
await age(o1.id, 8);
r = await run();
let p1 = await payoutFor(o1.id);
check("payout created after 7 days", r.status === 200 && p1 && p1.amount_paise === expectedNet(gross1, 0), r.status + " " + JSON.stringify(p1 && { amount: p1.amount_paise }));
check("held while the bank account is being verified", p1?.status === "ON_HOLD" && /being verified/.test(p1.failure_reason ?? ""), JSON.stringify(p1 && { s: p1.status, why: p1.failure_reason }));
check("seller alerted that the payment is on hold", (await alerts("PAYOUT_ON_HOLD")).length >= 1);

// --- admin verifies the account → paid
r = await admin(`/api/v1/sellers/${me.id}/bank-account`, { method: "POST", body: { decision: "VERIFIED" } });
check("admin verifies the bank account", r.status === 200, String(r.status));
r = await admin(`/api/v1/payouts/${p1.id}`, { method: "POST", body: { action: "RETRY" } });
p1 = await payoutFor(o1.id);
check("payout sent (test mode) with a UTR", r.json?.outcome === "PAID" && p1.status === "PAID" && /^TEST/.test(p1.utr ?? "") && p1.mode === "TEST" && p1.paid_at, JSON.stringify(r.json));
check("seller alerted that money was sent", (await alerts("PAYOUT_PAID")).some((n) => n.title.includes("sent to your bank")));
const runAgain = (await run()).json;
check("running again never pays twice", (await sql`select count(*)::int n from payout_items pi join order_items oi on oi.id = pi.order_item_id where oi.order_id = ${o1.id}`)[0].n === 1 && (await sql`select count(*)::int n from payouts where id = ${p1.id} and status = 'PAID'`)[0].n === 1, JSON.stringify(runAgain));
check("already-sent payout can't be retried", (await admin(`/api/v1/payouts/${p1.id}`, { method: "POST", body: { action: "RETRY" } })).status === 409);

// --- after 3 months: 5% commission + GST; open return holds, partial return deducted
await sql`update sellers set approved_at = now() - interval '4 months' where id = ${me.id}`;
const o2 = await deliveredOrder(2);
const [line2] = await sql`select id from order_items where order_id = ${o2.id}`;
const [ret] = await sql`insert into returns (order_id, seller_id, status, reason) values (${o2.id}, ${me.id}, 'REQUESTED', 'E2E payout test') returning id`;
await sql`insert into return_items (return_id, order_item_id, quantity, reason) values (${ret.id}, ${line2.id}, 1, 'E2E')`;
await age(o2.id, 8);
await run();
check("open return holds the item's payment", !(await payoutFor(o2.id)));
mine = (await seller("/api/v1/payouts")).json;
check("seller sees money held by the return", mine?.upcoming?.some((u) => u.orderNumber === o2.order_number && u.openReturn) && mine.summary.heldByReturnsPaise > 0);
await sql`update returns set status = 'RECEIVED' where id = ${ret.id}`;
await run();
const p2 = await payoutFor(o2.id);
const [i2] = await itemsFor(o2.id);
check("after the return: paid for the 1 unit kept", p2?.status === "PAID" && i2.quantity === 1 && i2.gross_amount_paise === o2.unit, JSON.stringify(i2 && { q: i2.quantity, g: i2.gross_amount_paise }));
check("5% commission + 18% GST, TCS 0.5%, TDS 0.1%", i2.commission_rate_bps === 500 && i2.commission_paise === pct(o2.unit, 500) && i2.gst_on_commission_paise === pct(pct(o2.unit, 500), 1800) && i2.tds_paise === pct(o2.unit, 10) && i2.net_amount_paise === expectedNet(o2.unit, 500), JSON.stringify(i2));

// --- admin hold
r = await admin(`/api/v1/sellers/${me.id}/payout-hold`, { method: "POST", body: { hold: true } });
check("hold needs a reason", r.status === 400);
await admin(`/api/v1/sellers/${me.id}/payout-hold`, { method: "POST", body: { hold: true, reason: "Customer complaint under review" } });
const o3 = await deliveredOrder(1);
await age(o3.id, 8);
await run();
let p3 = await payoutFor(o3.id);
check("admin hold stops payouts, with the reason", p3?.status === "ON_HOLD" && p3.failure_reason?.includes("Customer complaint under review"), JSON.stringify(p3 && { s: p3.status, why: p3.failure_reason }));
check("seller sees the hold", (await seller("/api/v1/payouts")).json?.holdReason === "Customer complaint under review");
await admin(`/api/v1/sellers/${me.id}/payout-hold`, { method: "POST", body: { hold: false } });
await run();
p3 = await payoutFor(o3.id);
check("released: paid on the next run", p3?.status === "PAID", p3?.status);

// --- bank rejects the transfer (test account ending 0000)
await seller("/api/v1/bank-account", { method: "POST", body: { accountHolderName: "Bharat Demo Store", accountNumber: "123456780000", confirmAccountNumber: "123456780000", ifsc: "SBIN0001234" } });
check("new bank account pauses payouts until verified", (await seller("/api/v1/payouts")).json?.bankAccount?.status === "PENDING");
await admin(`/api/v1/sellers/${me.id}/bank-account`, { method: "POST", body: { decision: "VERIFIED" } });
const o4 = await deliveredOrder(1);
await age(o4.id, 8);
await run();
const p4 = await payoutFor(o4.id);
const [badAcct] = await sql`select verification_status s, rejection_reason r from seller_bank_accounts where seller_id = ${me.id} and is_primary`;
check("bank rejection: payout held, account marked rejected", p4?.status === "ON_HOLD" && badAcct.s === "REJECTED" && /closed/.test(badAcct.r ?? ""), JSON.stringify({ p: p4?.status, badAcct }));
r = await admin(`/api/v1/sellers/${me.id}/bank-account`, { method: "POST", body: { decision: "REJECTED" } });
check("rejecting an account needs a reason", r.status === 400);
// Seller fixes it; admin verifies; paid.
await seller("/api/v1/bank-account", { method: "POST", body: { accountHolderName: "Bharat Demo Store", accountNumber: "50100123456789", confirmAccountNumber: "50100123456789", ifsc: "HDFC0001234" } });
await admin(`/api/v1/sellers/${me.id}/bank-account`, { method: "POST", body: { decision: "VERIFIED" } });
await run();
check("after fixing the account, payout goes through", (await payoutFor(o4.id))?.status === "PAID");

// --- reports
const fin = (await admin("/api/v1/payouts")).json;
check("admin finance shows payouts, commission and taxes", fin?.mode === "TEST" && fin.items.some((p) => p.id === p2.id && p.status === "PAID") && fin.summary.commission30dPaise >= i2.commission_paise + i2.gst_on_commission_paise && fin.summary.tds30dPaise > 0, JSON.stringify(fin?.summary));
const detail = (await admin(`/api/v1/payouts/${p2.id}`)).json;
check("admin sees the order-by-order breakdown", detail?.items?.[0]?.orderNumber === o2.order_number && detail.items[0].netPaise === i2.net_amount_paise);
mine = (await seller("/api/v1/payouts")).json;
check("seller sees sent payments with UTR", mine?.payouts?.some((p) => p.id === p1.id && p.status === "PAID" && p.utr) && mine.summary.paid30dPaise >= p1.amount_paise);
check("seller sees the breakdown of their payment", (await seller(`/api/v1/payouts/${p2.id}`)).json?.items?.[0]?.commissionRateBps === 500);
const audits = await sql`select action from audit_logs where entity_id in (${p1.id}, ${me.id}) and created_at > now() - interval '15 minutes'`;
check("payouts, holds and bank checks audited", ["PAYOUT_PAID", "PAYOUTS_HELD", "PAYOUTS_RELEASED", "BANK_ACCOUNT_VERIFIED"].every((a) => audits.some((x) => x.action === a)));

// --- access
check("payout job refuses callers without the secret", (await anon("/api/cron/payouts", { method: "POST" })).status === 401);
check("sellers can't see AzadiMart finance", [401, 403].includes((await seller(`${AD}/api/v1/payouts`)).status));
check("sellers can't approve payouts or verify their own bank", [401, 403].includes((await seller(`${AD}/api/v1/payouts/${p1.id}`, { method: "POST", body: { action: "APPROVE" } })).status) && [401, 403].includes((await seller(`${AD}/api/v1/sellers/${me.id}/bank-account`, { method: "POST", body: { decision: "VERIFIED" } })).status));
check("customers can't see seller payments", [401, 403].includes((await shop(`${SE}/api/v1/payouts`)).status));
const [otherPayout] = await sql`select id from payouts where seller_id <> ${me.id} limit 1`;
if (otherPayout) check("a seller can't open another seller's payout", (await seller(`/api/v1/payouts/${otherPayout.id}`)).status === 404);

// --- tidy up: put the seller back, return delivered stock, move test orders out of recent sales figures (payouts keep their real dates)
await restore();
await sql`update inventory set on_hand = on_hand + ${deliveredUnits} where variant_id = ${product.variant_id}`;
await sql`update orders set created_at = created_at - interval '1 year', delivered_at = delivered_at - interval '1 year' where id = any(${orders})`;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
