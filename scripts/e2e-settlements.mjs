// End-to-end test for 15-day settlements: in FORTNIGHTLY mode a payout run
// pays a seller once per cycle (1st / 16th, India time) for orders whose
// 7-day return window closed before the cycle started; later ones wait.
// Each payout gets a settlement statement and LOIMART's fee invoice
// (commission + 18% GST, LOIMART courier fees, ads), visible to the seller
// and Admin only. Requires the demo seed + catalogue seed and all three apps
// against a NON-PRODUCTION database.
//   ALLOW_E2E=YES SELLER_URL=… ADMIN_URL=… STOREFRONT_URL=… pnpm e2e:settlements
import { neon } from "@neondatabase/serverless";

if (process.env.NODE_ENV === "production") throw new Error("E2E test is disabled when NODE_ENV=production.");
if (process.env.ALLOW_E2E !== "YES") throw new Error("Set ALLOW_E2E=YES to run the E2E test (it writes test data).");

const SE = process.env.SELLER_URL ?? "http://localhost:3001";
const AD = process.env.ADMIN_URL ?? "http://localhost:3002";
const SF = process.env.STOREFRONT_URL ?? "http://localhost:3000";
const PW = process.env.DEMO_PASSWORD || "AzadiDemo2026!";
const sql = neon(process.env.DATABASE_URL);
await sql`delete from rate_limit_buckets where key like 'checkout:%'`;
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
const seller = client(SE), admin = client(AD), shop = client(SF);
await seller("/api/auth/login", { method: "POST", body: { email: "demo.seller@azadimart.test", password: PW } });
await admin("/api/auth/login", { method: "POST", body: { email: "demo.admin@azadimart.test", password: PW } });
await shop("/api/auth/login", { method: "POST", body: { email: "demo.customer@azadimart.test", password: PW } });

// Cycle start (1st or 16th, midnight India time) for now.
const IST = 330 * 60_000;
const ist = new Date(Date.now() + IST);
const cycleStart = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() >= 16 ? 16 : 1) - IST);
const DAY = 864e5;

const [me] = await sql`select s.id, s.approved_at, s.payout_hold_reason from sellers s join users u on u.id = s.user_id where u.email = 'demo.seller@azadimart.test'`;
const [product] = await sql`select v.id variant_id, p.id product_id from product_variants v join products p on p.id = v.product_id join inventory i on i.variant_id = v.id
  where p.seller_id = ${me.id} and p.status = 'LIVE' and v.is_active and i.on_hand - i.reserved >= 3 order by p.created_at desc limit 1`;
if (!product) throw new Error("Need a stocked live product from the demo seller.");
const [cycleBefore] = await sql`select value from platform_settings where key = 'settlement_cycle'`;
// A payout already made for this seller in this cycle (an earlier run) would hold this one back: park it while testing.
const parked = await sql`update payouts set period_end = period_end - interval '100 years' where seller_id = ${me.id} and period_end = ${cycleStart} returning id`;
const orders = [];
let delivered = 0;
async function tidy() {
  await sql`update payouts set period_end = period_end + interval '100 years' where id = any(${parked.map((p) => p.id)}::uuid[])`;
  await sql`update sellers set approved_at = ${me.approved_at}, payout_hold_reason = ${me.payout_hold_reason} where id = ${me.id}`;
  if (cycleBefore) await sql`update platform_settings set value = ${cycleBefore.value} where key = 'settlement_cycle'`;
  else await sql`delete from platform_settings where key = 'settlement_cycle'`;
  await sql`update inventory set on_hand = on_hand + ${delivered} where variant_id = ${product.variant_id}`;
  await sql`update orders set created_at = created_at - interval '1 year', delivered_at = delivered_at - interval '1 year' where id = any(${orders}::uuid[])`;
}
for (const event of ["uncaughtException", "unhandledRejection"]) process.on(event, (error) => { console.error(error); tidy().finally(() => process.exit(1)); });

// --- Admin chooses 15-day settlements
let r = await admin("/api/v1/finance/settlement-cycle", { method: "PUT", body: { cycle: "FORTNIGHTLY" } });
const next = new Date(r.json?.nextAt);
check("Admin sets settlements to every 15 days", r.status === 200 && r.json.cycle === "FORTNIGHTLY" && [1, 16].includes(new Date(next.getTime() + IST).getUTCDate()), r.json?.nextAt);
check("sellers can't change the cycle", [401, 403].includes((await seller(`${AD}/api/v1/finance/settlement-cycle`, { method: "PUT", body: { cycle: "DAILY" } })).status));
await sql`update sellers set approved_at = now() - interval '4 months', payout_hold_reason = null where id = ${me.id}`;

// --- three delivered orders: window closed before this cycle, during it, and still open
const address = (await shop("/api/v1/addresses", { method: "POST", body: { line1: "21 Residency Road", city: "Bengaluru", state: "Karnataka", postalCode: "560025", isDefault: true } })).json;
const addressId = address?.address?.id ?? address?.item?.id ?? address?.id;
async function deliveredOrder(deliveredAt, feePaise) {
  for (const item of (await shop("/api/v1/cart")).json?.items ?? []) await shop("/api/v1/cart", { method: "DELETE", body: { variantId: item.variantId } });
  await shop("/api/v1/cart", { method: "POST", body: { variantId: product.variant_id, quantity: 1 } });
  const o = await shop("/api/v1/checkout", { method: "POST", body: { shippingAddressId: addressId, paymentMethod: "COD" } });
  if (!o.json?.orderId) throw new Error("Checkout failed: " + o.status + " " + JSON.stringify(o.json));
  orders.push(o.json.orderId);
  const [s] = await sql`insert into shipments (order_id, seller_id, status, shipped_by, shipping_fee_paise, awb) values (${o.json.orderId}, ${me.id}, 'OUT_FOR_DELIVERY', 'LOIMART', ${feePaise}, ${"E2ESET" + Date.now()}) returning id`;
  const d = await admin(`/api/v1/shipments/${s.id}`, { method: "PATCH", body: { status: "DELIVERED" } });
  if (d.status !== 200) throw new Error("Delivery failed: " + JSON.stringify(d.json));
  delivered++;
  await sql`update orders set delivered_at = ${deliveredAt} where id = ${o.json.orderId}`;
  return { orderId: o.json.orderId, shipmentId: s.id };
}
const a = await deliveredOrder(new Date(cycleStart.getTime() - 8 * DAY), 11800); // window closed before this cycle
const midCycle = Date.now() - cycleStart.getTime() > 2 * 3600_000;
const c = midCycle ? await deliveredOrder(new Date(cycleStart.getTime() - 7 * DAY + 3600_000), 0) : null; // closed after the cycle started
const b = await deliveredOrder(new Date(), 0); // still in the return window

r = await admin("/api/cron/payouts", { method: "POST" });
const payoutOf = async (orderId) => (await sql`select p.* from payouts p join payout_items pi on pi.payout_id = p.id join order_items oi on oi.id = pi.order_item_id where oi.order_id = ${orderId}`)[0];
const pa = await payoutOf(a.orderId);
check("the run settles the order whose window closed before this cycle", r.status === 200 && Boolean(pa), JSON.stringify(r.json));
check("…for the cycle before (period ends on the 1st/16th)", pa && new Date(pa.period_end).getTime() === cycleStart.getTime() && new Date(pa.period_start) < cycleStart, pa && `${pa.period_start} → ${pa.period_end}`);
if (c) check("an order whose window closed during this cycle waits for the next one", !(await payoutOf(c.orderId)));
check("an order still in its return window isn't paid", !(await payoutOf(b.orderId)));
await admin("/api/cron/payouts", { method: "POST" });
const inCycle = await sql`select count(*)::int n from payouts where seller_id = ${me.id} and period_end = ${cycleStart}`;
check("running again the same cycle never makes a second payout", inCycle[0].n === 1, String(inCycle[0].n));

// --- LOIMART's fee invoice
const [fee] = await sql`select * from fee_invoices where payout_id = ${pa?.id}`;
const [items] = await sql`select coalesce(sum(commission_paise),0)::int c, coalesce(sum(gst_on_commission_paise),0)::int g from payout_items where payout_id = ${pa?.id}`;
const courier = fee?.details?.lines?.find((l) => l.sac === "996812");
check("a fee invoice is issued with the settlement (LMS/…)", /^LMS\/\d{4}\/\d{6}$/.test(fee?.number ?? ""), fee?.number);
check("it bills the LOIMART courier fee (₹118 = ₹100 + 18% GST)", courier?.taxablePaise === 10000 && courier.totalPaise === 11800, JSON.stringify(courier));
const commissionLine = fee?.details?.lines?.find((l) => l.sac === "998599");
check("it bills the commission + 18% GST from the settlement", items.c === 0 ? !commissionLine : commissionLine?.taxablePaise === items.c && commissionLine.totalPaise === items.c + items.g, JSON.stringify({ items, commissionLine }));
check("the invoice adds up", fee && fee.taxable_paise + fee.cgst_paise + fee.sgst_paise + fee.igst_paise === fee.total_paise);
const [ship] = await sql`select fee_invoice_id from shipments where id = ${a.shipmentId}`;
check("the parcel is marked billed (never billed twice)", ship.fee_invoice_id === fee?.id);

// --- the seller sees the statement and the invoice
r = await seller("/api/v1/payouts");
const listed = r.json?.payouts?.find((p) => p.id === pa?.id);
check("Seller Centre lists the settlement with its period and fee invoice", listed?.feeInvoiceId === fee?.id && Boolean(listed.periodStart) && r.json.settlement?.cycle === "FORTNIGHTLY", JSON.stringify(listed && { fee: listed.feeInvoiceId, period: listed.periodStart }));
r = await seller(`/api/v1/payouts/${pa?.id}/statement`);
const st = r.json?.statement;
check("the statement lists the order and adds up to what was paid", r.status === 200 && st.lines.some((l) => l.netPaise > 0) && st.totals.netPaise === pa.amount_paise && st.feeInvoice?.number === fee?.number, JSON.stringify(st?.totals));
const deductions = st.totals.sellerDiscountPaise + st.totals.commissionPaise + st.totals.gstOnCommissionPaise + st.totals.shippingFeePaise + (st.totals.cashbackPaise ?? 0) + st.totals.tcsPaise + st.totals.tdsPaise + st.totals.chargesPaise;
check("sales − deductions = paid", st.totals.grossPaise - deductions === st.totals.netPaise, `${st.totals.grossPaise} − ${deductions} vs ${st.totals.netPaise}`);
check("the seller can open the fee invoice", (await seller(`/api/v1/fee-invoices/${fee?.id}`)).status === 200);
check("customers can't", [401, 403].includes((await shop(`${SE}/api/v1/fee-invoices/${fee?.id}`)).status) && [401, 403].includes((await shop(`${SE}/api/v1/payouts/${pa?.id}/statement`)).status));
r = await admin(`/api/v1/finance/fee-invoices?q=${encodeURIComponent(fee?.number ?? "")}`);
check("Admin finds it under fee invoices", r.json?.items?.some((x) => x.id === fee?.id));
r = await admin("/api/v1/payouts");
check("Admin's payout list links the fee invoice", r.json?.items?.find((p) => p.id === pa?.id)?.feeInvoiceId === fee?.id);

// --- goods sent back after the seller was paid: recovery + fee credit note
r = await admin(`/api/v1/shipments/${a.shipmentId}`, { method: "PATCH", body: { status: "RETURNED" } });
const [adj] = await sql`select * from settlement_adjustments where source_key = ${"RTO:" + a.shipmentId}`;
const [paidItem] = await sql`select pi.* from payout_items pi join order_items oi on oi.id = pi.order_item_id where oi.order_id = ${a.orderId}`;
check("a parcel sent back after settlement is recorded", r.status === 200 && adj?.quantity === paidItem.quantity, String(r.status));
// The shopper keeps cashback already given, so the seller's share of it isn't asked back either.
const expectRecovery = paidItem.gross_amount_paise - paidItem.seller_discount_paise - paidItem.commission_paise - paidItem.gst_on_commission_paise - paidItem.tcs_paise - paidItem.cashback_paise;
check("the seller gives back the sale less commission, its GST, TCS and cashback share (TDS and courier stay)", adj?.recovery_paise === expectRecovery, `${adj?.recovery_paise} vs ${expectRecovery}`);
const [charge] = await sql`select * from seller_charges where kind = 'RETURN_RECOVERY' and reference_id = ${adj?.id}`;
check("…taken from the next payout", charge?.status === "PENDING" && charge.amount_paise === expectRecovery);
const [cn] = await sql`select * from fee_invoices where kind = 'CREDIT_NOTE' and source_key = ${"RTO:" + a.shipmentId + ":" + me.id}`;
if (items.c > 0) {
  check("a fee credit note gives back the commission + GST (LMC/…)", /^LMC\/\d{4}\/\d{6}$/.test(cn?.number ?? "") && cn.total_paise === paidItem.commission_paise + paidItem.gst_on_commission_paise && cn.original_fee_invoice_id === fee?.id, cn?.number);
  r = await seller("/api/v1/payouts");
  check("the seller sees the fee credit note", r.json?.feeCreditNotes?.some((n) => n.id === cn?.id) && (await seller(`/api/v1/fee-invoices/${cn?.id}`)).json?.invoice?.kind === "CREDIT_NOTE");
} else check("no commission charged, so no fee credit note", !cn);
await admin(`/api/v1/shipments/${a.shipmentId}`, { method: "PATCH", body: { status: "RETURNED" } });
check("recorded once", (await sql`select count(*)::int n from settlement_adjustments where source_key = ${"RTO:" + a.shipmentId}`)[0].n === 1);

// --- monthly TCS / TDS
const month = new Date(Date.now() + IST).toISOString().slice(0, 7);
r = await admin(`/api/v1/finance/tax-report?month=${month}`);
const mine = r.json?.rows?.find((x) => x.sellerId === me.id);
check("TCS & TDS report shows the seller's supplies, returns and tax this month", r.status === 200 && mine && mine.suppliesPaise >= paidItem.gross_amount_paise && mine.returnsPaise >= adj.sold_paise && mine.tcsIgstPaise + mine.tcsCgstPaise + mine.tcsSgstPaise === mine.tcsPaise, JSON.stringify(mine && { s: mine.suppliesPaise, r: mine.returnsPaise, tcs: mine.tcsPaise }));
check("TCS is on the value before GST", paidItem.tcs_paise === Math.round(Math.round((paidItem.gross_amount_paise - paidItem.seller_discount_paise) * 10000 / (10000 + (await sql`select gst_rate_bps from order_items where order_id = ${a.orderId}`)[0].gst_rate_bps)) * 50 / 10000), String(paidItem.tcs_paise));
check("a bad month is refused", (await admin("/api/v1/finance/tax-report?month=2026-13")).status === 400);
r = await seller("/api/v1/payouts/tax");
check("the seller sees TCS and TDS deducted by month", r.json?.months?.some((m) => m.month === month && m.tdsPaise > 0));
check("sellers can't open LOIMART's tax report", [401, 403].includes((await seller(`${AD}/api/v1/finance/tax-report?month=${month}`)).status));
// Test recoveries mustn't come off the demo seller's later payouts.
await sql`update seller_charges set status = 'WAIVED' where kind = 'RETURN_RECOVERY' and seller_id = ${me.id} and status = 'PENDING'`;

await tidy();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
