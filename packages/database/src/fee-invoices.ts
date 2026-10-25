import { FEE_SAC, GST_ON_FEES_BPS, financialYearOf, feeInvoiceNumber, gstStateCode, isInterStateSupply, splitGstInclusive, testProvidersAllowed } from "@azadimart/shared";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { getCompanyDetails } from "./invoices";
import { auditLogs, feeInvoices, orderItems, orders, payoutItems, payouts, sellerCharges, sellerSettings, sellers, settlementAdjustments, shipments, type FeeInvoiceDetails } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Numbers and saves a fee invoice or credit note (LOIMART's own series per kind and financial year). */
async function insertFeeDocument(tx: Tx, input: { kind: "INVOICE" | "CREDIT_NOTE"; sellerId: string; payoutId?: string | null; originalFeeInvoiceId?: string | null; sourceKey?: string | null; details: FeeInvoiceDetails; isTest: boolean }) {
  const issuedAt = new Date();
  const financialYear = financialYearOf(issuedAt);
  // One series for all sellers: lock it for this financial year while numbering.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`fee_invoices:${input.kind}:${financialYear}`}, 0))`);
  const sequence = ((await tx.select({ n: sql<number>`coalesce(max(${feeInvoices.sequence}), 0)::int` }).from(feeInvoices).where(and(eq(feeInvoices.financialYear, financialYear), eq(feeInvoices.kind, input.kind))))[0]?.n ?? 0) + 1;
  const sum = (k: "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise" | "totalPaise") => input.details.lines.reduce((n, l) => n + l[k], 0);
  return (await tx.insert(feeInvoices).values({
    kind: input.kind, number: feeInvoiceNumber(financialYear, sequence, input.kind), financialYear, sequence, sellerId: input.sellerId, payoutId: input.payoutId ?? null,
    originalFeeInvoiceId: input.originalFeeInvoiceId ?? null, sourceKey: input.sourceKey ?? null, issuedAt,
    taxablePaise: sum("taxablePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise"), totalPaise: sum("totalPaise"),
    isTest: input.isTest, details: input.details,
  }).returning())[0]!;
}

/**
 * LOIMART's tax invoice to a seller for its services in one settlement:
 * commission (+18% GST), LOIMART courier fees (rate card includes GST) and
 * ads. Issued with the payout; nothing is issued when there are no fees
 * (e.g. commission-free months and no courier or ads). Safe to call twice.
 */
export async function issueFeeInvoice(tx: Tx, payoutId: string, actorUserId: string | null = null) {
  const existing = (await tx.select().from(feeInvoices).where(and(eq(feeInvoices.payoutId, payoutId), eq(feeInvoices.kind, "INVOICE"))).limit(1))[0];
  if (existing) return existing;
  const payout = (await tx.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1))[0];
  if (!payout) return null;

  const commission = (await tx.select({
    taxable: sql<number>`coalesce(sum(${payoutItems.commissionPaise}), 0)::int`, gst: sql<number>`coalesce(sum(${payoutItems.gstOnCommissionPaise}), 0)::int`,
  }).from(payoutItems).where(eq(payoutItems.payoutId, payoutId)))[0]!;
  // Courier: every LOIMART parcel in this settlement not billed before (its full fee, whether paid from the wallet or the payout).
  const orderIds = tx.select({ id: orderItems.orderId }).from(payoutItems).innerJoin(orderItems, eq(orderItems.id, payoutItems.orderItemId)).where(eq(payoutItems.payoutId, payoutId));
  const parcels = await tx.select({ id: shipments.id, fee: shipments.shippingFeePaise }).from(shipments)
    .where(and(eq(shipments.sellerId, payout.sellerId), inArray(shipments.orderId, orderIds), isNull(shipments.feeInvoiceId), gt(shipments.shippingFeePaise, 0)));
  const ads = (await tx.select({ base: sql<number>`coalesce(sum(${sellerCharges.basePaise}), 0)::int`, gst: sql<number>`coalesce(sum(${sellerCharges.gstPaise}), 0)::int` })
    .from(sellerCharges).where(and(eq(sellerCharges.payoutId, payoutId), eq(sellerCharges.kind, "AD"))))[0]!;
  const courierTotal = parcels.reduce((n, p) => n + p.fee, 0);
  if (commission.taxable + courierTotal + ads.base <= 0) return null;

  const company = await getCompanyDetails(tx);
  const seller = (await tx.select({ s: sellers, shipping: sellerSettings.shippingSettings }).from(sellers).leftJoin(sellerSettings, eq(sellerSettings.sellerId, sellers.id)).where(eq(sellers.id, payout.sellerId)).limit(1))[0]!;
  const pickup = (seller.shipping as { pickup?: { line1?: string; line2?: string | null; city?: string; state?: string; postalCode?: string } } | null)?.pickup;
  const sellerState = pickup?.state || seller.s.businessState || "";
  const interState = isInterStateSupply(company.state, sellerState);
  const line = (description: string, sac: string, taxablePaise: number, gstPaise: number) => {
    const cgst = interState ? 0 : Math.floor(gstPaise / 2);
    return { description, sac, taxablePaise, rateBps: GST_ON_FEES_BPS, cgstPaise: cgst, sgstPaise: interState ? 0 : gstPaise - cgst, igstPaise: interState ? gstPaise : 0, totalPaise: taxablePaise + gstPaise };
  };
  const courier = splitGstInclusive(courierTotal, GST_ON_FEES_BPS);
  const lines = [
    commission.taxable > 0 ? line("Marketplace commission on orders settled", FEE_SAC.COMMISSION, commission.taxable, commission.gst) : null,
    courierTotal > 0 ? line(`LOIMART courier service (${parcels.length} parcel${parcels.length === 1 ? "" : "s"})`, FEE_SAC.COURIER, courier.taxablePaise, courier.taxPaise) : null,
    ads.base > 0 ? line("Advertising on LOIMART", FEE_SAC.ADS, ads.base, ads.gst) : null,
  ].filter((l): l is NonNullable<typeof l> => Boolean(l));

  const details: FeeInvoiceDetails = {
    company: { legalName: company.legalName, tradeName: company.tradeName, gstin: company.gstin, pan: company.pan, address: company.address, state: company.state, stateCode: gstStateCode(company.state) },
    seller: {
      legalName: seller.s.legalName, storeName: seller.s.storeName, gstin: seller.s.gstin, state: sellerState, stateCode: gstStateCode(sellerState),
      address: pickup ? [pickup.line1, pickup.line2, pickup.city, [pickup.state, pickup.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") : sellerState,
    },
    periodStart: payout.periodStart?.toISOString() ?? null, periodEnd: payout.periodEnd?.toISOString() ?? null, payoutReference: payout.reference, interState, lines,
  };
  const row = await insertFeeDocument(tx, { kind: "INVOICE", sellerId: payout.sellerId, payoutId, details, isTest: testProvidersAllowed() || !company.gstin });
  if (parcels.length) await tx.update(shipments).set({ feeInvoiceId: row.id }).where(inArray(shipments.id, parcels.map((p) => p.id)));
  await tx.insert(auditLogs).values({ actorUserId, action: "FEE_INVOICE_ISSUED", entityType: "fee_invoice", entityId: row.id, metadata: { number: row.number, payoutId, sellerId: payout.sellerId, totalPaise: row.totalPaise } });
  return row;
}

/** Everything a settlement statement shows: the payout, each order line, ad charges and the fee invoice. */
export async function loadSettlementStatement(db: Pick<Db, "select">, payoutId: string, sellerId?: string) {
  const payout = (await db.select().from(payouts).where(sellerId ? and(eq(payouts.id, payoutId), eq(payouts.sellerId, sellerId)) : eq(payouts.id, payoutId)).limit(1))[0];
  if (!payout) return null;
  const [seller, lines, charges, invoice, company] = await Promise.all([
    db.select({ legalName: sellers.legalName, storeName: sellers.storeName, gstin: sellers.gstin, pan: sellers.pan }).from(sellers).where(eq(sellers.id, payout.sellerId)).limit(1).then((r) => r[0]!),
    db.select({
      orderNumber: orders.orderNumber, orderedAt: orders.createdAt, deliveredAt: orders.deliveredAt, title: orderItems.title, sku: orderItems.sku, quantity: payoutItems.quantity,
      grossPaise: payoutItems.grossAmountPaise, sellerDiscountPaise: payoutItems.sellerDiscountPaise, commissionRateBps: payoutItems.commissionRateBps, commissionPaise: payoutItems.commissionPaise,
      gstOnCommissionPaise: payoutItems.gstOnCommissionPaise, shippingFeePaise: payoutItems.shippingFeePaise, cashbackPaise: payoutItems.cashbackPaise, tcsPaise: payoutItems.tcsPaise, tdsPaise: payoutItems.tdsPaise, netPaise: payoutItems.netAmountPaise,
    }).from(payoutItems).innerJoin(orderItems, eq(orderItems.id, payoutItems.orderItemId)).innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(payoutItems.payoutId, payoutId)).orderBy(orders.createdAt),
    db.select({ kind: sellerCharges.kind, description: sellerCharges.description, amountPaise: sellerCharges.amountPaise }).from(sellerCharges).where(eq(sellerCharges.payoutId, payoutId)),
    db.select({ id: feeInvoices.id, number: feeInvoices.number, totalPaise: feeInvoices.totalPaise }).from(feeInvoices).where(and(eq(feeInvoices.payoutId, payoutId), eq(feeInvoices.kind, "INVOICE"))).limit(1).then((r) => r[0] ?? null),
    getCompanyDetails(db),
  ]);
  const sum = (k: keyof (typeof lines)[number]) => lines.reduce((n, l) => n + (typeof l[k] === "number" ? (l[k] as number) : 0), 0);
  return {
    payout: { id: payout.id, reference: payout.reference, status: payout.status, amountPaise: payout.amountPaise, utr: payout.utr, mode: payout.mode, paidAt: payout.paidAt?.toISOString() ?? null, createdAt: payout.createdAt.toISOString(), periodStart: payout.periodStart?.toISOString() ?? null, periodEnd: payout.periodEnd?.toISOString() ?? null },
    seller, company: { legalName: company.legalName, gstin: company.gstin, address: company.address },
    lines: lines.map((l) => ({ ...l, orderedAt: l.orderedAt.toISOString(), deliveredAt: l.deliveredAt?.toISOString() ?? null })),
    charges, feeInvoice: invoice,
    totals: {
      grossPaise: sum("grossPaise"), sellerDiscountPaise: sum("sellerDiscountPaise"), commissionPaise: sum("commissionPaise"), gstOnCommissionPaise: sum("gstOnCommissionPaise"),
      shippingFeePaise: sum("shippingFeePaise"), cashbackPaise: sum("cashbackPaise"), tcsPaise: sum("tcsPaise"), tdsPaise: sum("tdsPaise"), chargesPaise: charges.reduce((n, c) => n + c.amountPaise, 0),
      adsPaise: charges.filter((c) => c.kind === "AD").reduce((n, c) => n + c.amountPaise, 0), recoveriesPaise: charges.filter((c) => c.kind === "RETURN_RECOVERY").reduce((n, c) => n + c.amountPaise, 0), netPaise: payout.amountPaise,
    },
  };
}
export type SettlementStatement = NonNullable<Awaited<ReturnType<typeof loadSettlementStatement>>>;

/**
 * Goods returned after the seller was paid for them (a return received or a
 * delivered parcel sent back late). For each returned piece already in a
 * payout: the seller gives back what they were paid for it (sale price less
 * commission, its GST, the TCS and their cashback share), taken from their next payout, and a fee
 * credit note gives back that commission and its GST. Safe to call twice.
 */
export async function recordReturnAfterSettlement(tx: Tx, input: { sellerId: string; sourceKey: string; quantities: Map<string, number>; actorUserId?: string | null }) {
  const ids = [...input.quantities.keys()];
  if (!ids.length) return null;
  const paid = await tx.select({
    orderItemId: payoutItems.orderItemId, payoutId: payoutItems.payoutId, quantity: payoutItems.quantity, grossPaise: payoutItems.grossAmountPaise, sellerDiscountPaise: payoutItems.sellerDiscountPaise,
    commissionPaise: payoutItems.commissionPaise, gstPaise: payoutItems.gstOnCommissionPaise, tcsPaise: payoutItems.tcsPaise, cashbackPaise: payoutItems.cashbackPaise, title: orderItems.title, orderNumber: orders.orderNumber,
  }).from(payoutItems).innerJoin(orderItems, eq(orderItems.id, payoutItems.orderItemId)).innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(inArray(payoutItems.orderItemId, ids), eq(orderItems.sellerId, input.sellerId)));
  const made: Array<typeof settlementAdjustments.$inferSelect & { payoutId: string }> = [];
  for (const p of paid) {
    if ((await tx.select({ id: settlementAdjustments.id }).from(settlementAdjustments).where(and(eq(settlementAdjustments.sourceKey, input.sourceKey), eq(settlementAdjustments.orderItemId, p.orderItemId))).limit(1)).length) continue;
    const already = (await tx.select({ n: sql<number>`coalesce(sum(${settlementAdjustments.quantity}), 0)::int` }).from(settlementAdjustments).where(eq(settlementAdjustments.orderItemId, p.orderItemId)))[0]?.n ?? 0;
    const qty = Math.min(input.quantities.get(p.orderItemId) ?? 0, p.quantity - already);
    if (qty <= 0 || p.quantity <= 0) continue;
    const share = (paise: number) => Math.round(paise * qty / p.quantity);
    const sold = share(p.grossPaise - p.sellerDiscountPaise), commission = share(p.commissionPaise), gst = share(p.gstPaise), tcs = share(p.tcsPaise);
    // The shopper keeps cashback already given, so the seller doesn't give back their share of it.
    const recovery = Math.max(0, sold - commission - gst - tcs - share(p.cashbackPaise));
    const row = (await tx.insert(settlementAdjustments).values({
      sellerId: input.sellerId, orderItemId: p.orderItemId, payoutId: p.payoutId, sourceKey: input.sourceKey, quantity: qty,
      soldPaise: sold, commissionPaise: commission, gstOnCommissionPaise: gst, tcsPaise: tcs, recoveryPaise: recovery,
    }).returning())[0]!;
    if (recovery > 0) await tx.insert(sellerCharges).values({ sellerId: input.sellerId, kind: "RETURN_RECOVERY", referenceId: row.id, description: `Returned after payment: ${p.title} × ${qty} (${p.orderNumber})`, basePaise: recovery, gstPaise: 0, amountPaise: recovery });
    made.push({ ...row, payoutId: p.payoutId });
  }
  const commission = made.reduce((n, a) => n + a.commissionPaise, 0), gst = made.reduce((n, a) => n + a.gstOnCommissionPaise, 0);
  if (!made.length || commission <= 0) return null;

  // Fee credit note against the fee invoice of the settlement that paid these pieces.
  const original = (await tx.select().from(feeInvoices).where(and(eq(feeInvoices.payoutId, made[0]!.payoutId), eq(feeInvoices.kind, "INVOICE"))).limit(1))[0];
  const company = await getCompanyDetails(tx);
  const base = original?.details;
  const interState = base ? base.interState : true;
  const cgst = interState ? 0 : Math.floor(gst / 2);
  const details: FeeInvoiceDetails = {
    company: base?.company ?? { legalName: company.legalName, tradeName: company.tradeName, gstin: company.gstin, pan: company.pan, address: company.address, state: company.state, stateCode: gstStateCode(company.state) },
    seller: base?.seller ?? { legalName: "", storeName: "", gstin: null, address: "", state: "", stateCode: null },
    periodStart: base?.periodStart ?? null, periodEnd: base?.periodEnd ?? null, payoutReference: base?.payoutReference ?? null, interState,
    lines: [{ description: `Commission returned on goods returned (${made.reduce((n, a) => n + a.quantity, 0)} piece${made.length === 1 && made[0]!.quantity === 1 ? "" : "s"})`, sac: FEE_SAC.COMMISSION, taxablePaise: commission, rateBps: GST_ON_FEES_BPS, cgstPaise: cgst, sgstPaise: interState ? 0 : gst - cgst, igstPaise: interState ? gst : 0, totalPaise: commission + gst }],
    ...(original ? { original: { number: original.number, issuedAt: original.issuedAt.toISOString() } } : {}),
    reason: "Goods returned after settlement",
  };
  const note = await insertFeeDocument(tx, { kind: "CREDIT_NOTE", sellerId: input.sellerId, originalFeeInvoiceId: original?.id ?? null, sourceKey: `${input.sourceKey}:${input.sellerId}`, details, isTest: original?.isTest ?? (testProvidersAllowed() || !company.gstin) });
  await tx.update(settlementAdjustments).set({ feeCreditNoteId: note.id }).where(inArray(settlementAdjustments.id, made.map((a) => a.id)));
  await tx.insert(auditLogs).values({ actorUserId: input.actorUserId ?? null, action: "FEE_CREDIT_NOTE_ISSUED", entityType: "fee_invoice", entityId: note.id, metadata: { number: note.number, sellerId: input.sellerId, sourceKey: input.sourceKey } });
  return note;
}
