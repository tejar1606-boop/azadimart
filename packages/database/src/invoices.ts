import { AppError, effectiveGstRule, financialYearOf, gstRateFor, gstStateCode, invoiceLines, invoiceNumber, isInterStateSupply, testProvidersAllowed, type GstRule, type InvoiceKind } from "@azadimart/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { createDatabase } from "./client";
import { getPlatformSetting } from "./platform-settings";
import { auditLogs, categories, invoiceCounters, invoices, orderItems, orders, payments, products, returnItems, returns, sellerSettings, sellers, type InvoiceDetails } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Pick<Db, "select">;

/** LOIMART's own registered details (Admin → Finance → Company & GST). Until the GSTIN is set, invoices are marked TEST. */
export type CompanyDetails = { legalName: string; tradeName: string; gstin: string | null; pan: string | null; cin: string | null; address: string; state: string; email: string | null };
export const COMPANY_DETAILS_KEY = "company_details";
export const DEFAULT_COMPANY: CompanyDetails = { legalName: "LOIMART", tradeName: "LOIMART", gstin: null, pan: null, cin: null, address: "", state: "", email: null };
export async function getCompanyDetails(db: Executor): Promise<CompanyDetails> {
  return { ...DEFAULT_COMPANY, ...((await getPlatformSetting<Partial<CompanyDetails>>(db, COMPANY_DETAILS_KEY)) ?? {}) };
}

const parent = alias(categories, "parent_category");
/** Each product's GST rule: its own HSN, else its category's, else the parent category's. */
export async function productGstRules(db: Executor, productIds: string[]): Promise<Map<string, GstRule & { source: "PRODUCT" | "CATEGORY" | "NONE" }>> {
  if (!productIds.length) return new Map();
  const rows = await db.select({
    id: products.id, hsnCode: products.hsnCode, gstRateBps: products.gstRateBps,
    cHsn: categories.hsnCode, cRate: categories.gstRateBps, cLimit: categories.gstPriceLimitPaise, cAbove: categories.gstRateAboveLimitBps,
    pHsn: parent.hsnCode, pRate: parent.gstRateBps, pLimit: parent.gstPriceLimitPaise, pAbove: parent.gstRateAboveLimitBps,
  }).from(products).innerJoin(categories, eq(categories.id, products.categoryId)).leftJoin(parent, eq(parent.id, categories.parentId))
    .where(inArray(products.id, [...new Set(productIds)]));
  return new Map(rows.map((r) => [r.id, effectiveGstRule(r, [
    { hsnCode: r.cHsn, gstRateBps: r.cRate, priceLimitPaise: r.cLimit, rateAboveLimitBps: r.cAbove },
    { hsnCode: r.pHsn, gstRateBps: r.pRate, priceLimitPaise: r.pLimit, rateAboveLimitBps: r.pAbove },
  ])]));
}

/** A category's GST rule, or its parent's when it has none. */
export async function categoryGstRule(db: Executor, categoryId: string): Promise<GstRule> {
  const r = (await db.select({ cHsn: categories.hsnCode, cRate: categories.gstRateBps, cLimit: categories.gstPriceLimitPaise, cAbove: categories.gstRateAboveLimitBps, pHsn: parent.hsnCode, pRate: parent.gstRateBps, pLimit: parent.gstPriceLimitPaise, pAbove: parent.gstRateAboveLimitBps })
    .from(categories).leftJoin(parent, eq(parent.id, categories.parentId)).where(eq(categories.id, categoryId)).limit(1))[0];
  if (!r) return { hsnCode: null, gstRateBps: null };
  return effectiveGstRule({ hsnCode: null, gstRateBps: null }, [
    { hsnCode: r.cHsn, gstRateBps: r.cRate, priceLimitPaise: r.cLimit, rateAboveLimitBps: r.cAbove },
    { hsnCode: r.pHsn, gstRateBps: r.pRate, priceLimitPaise: r.pLimit, rateAboveLimitBps: r.pAbove },
  ]);
}

/** HSN and rate for an order line, from the price the customer pays per piece after the seller's discount. */
export function orderLineGst(rule: GstRule | undefined, line: { unitPricePaise: number; quantity: number; sellerDiscountPaise: number }) {
  const perPiece = line.unitPricePaise - Math.floor(line.sellerDiscountPaise / Math.max(1, line.quantity));
  return { hsnCode: rule?.hsnCode ?? null, gstRateBps: gstRateFor(rule ?? { hsnCode: null, gstRateBps: null }, perPiece) };
}

async function nextSequence(tx: Tx, sellerId: string, kind: InvoiceKind, financialYear: string) {
  const row = (await tx.insert(invoiceCounters).values({ sellerId, kind, financialYear, lastSequence: 1 })
    .onConflictDoUpdate({ target: [invoiceCounters.sellerId, invoiceCounters.kind, invoiceCounters.financialYear], set: { lastSequence: sql`${invoiceCounters.lastSequence} + 1` } })
    .returning({ n: invoiceCounters.lastSequence }))[0];
  return row!.n;
}

const oneLine = (a: { line1?: string; line2?: string | null; city?: string; state?: string; postalCode?: string }) =>
  [a.line1, a.line2, a.city, [a.state, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");

async function insertInvoice(tx: Tx, input: { kind: InvoiceKind; orderId: string; sellerId: string; sourceKey: string; originalInvoiceId?: string; details: InvoiceDetails; isTest: boolean; actorUserId: string | null }) {
  const issuedAt = new Date();
  const financialYear = financialYearOf(issuedAt);
  const sequence = await nextSequence(tx, input.sellerId, input.kind, financialYear);
  const sum = (k: "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise" | "netPaise") => input.details.lines.reduce((n, l) => n + l[k], 0);
  const row = (await tx.insert(invoices).values({
    kind: input.kind, number: invoiceNumber(input.kind, financialYear, sequence), financialYear, sequence, issuedAt,
    orderId: input.orderId, sellerId: input.sellerId, originalInvoiceId: input.originalInvoiceId ?? null, sourceKey: input.sourceKey,
    taxablePaise: sum("taxablePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise"), totalPaise: sum("netPaise"),
    isTest: input.isTest, details: input.details,
  }).onConflictDoNothing({ target: invoices.sourceKey }).returning())[0];
  if (row) await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "INVOICE_ISSUED", entityType: "invoice", entityId: row.id, metadata: { kind: row.kind, number: row.number, orderId: row.orderId } });
  return row ?? null;
}

/**
 * Issues the seller's invoice for their part of an order (once; later calls
 * return the same one). A GST-registered seller gets a tax invoice, an
 * Enrolment ID seller a bill of supply. Called when the parcel is handed to
 * the courier.
 */
export async function issueSellerInvoice(tx: Tx, input: { orderId: string; sellerId: string; actorUserId?: string | null }) {
  const sourceKey = `ORDER:${input.orderId}:${input.sellerId}`;
  const existing = (await tx.select().from(invoices).where(eq(invoices.sourceKey, sourceKey)).limit(1))[0];
  if (existing) return existing;

  const order = (await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1))[0];
  if (!order) throw new AppError("NOT_FOUND", "Order not found");
  const seller = (await tx.select({ s: sellers, shipping: sellerSettings.shippingSettings }).from(sellers)
    .leftJoin(sellerSettings, eq(sellerSettings.sellerId, sellers.id)).where(eq(sellers.id, input.sellerId)).limit(1))[0];
  if (!seller) throw new AppError("NOT_FOUND", "Seller not found");
  const allItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, input.orderId));
  const items = allItems.filter((i) => i.sellerId === input.sellerId);
  if (!items.length) throw new AppError("NOT_FOUND", "This seller has no items in the order");
  const payment = (await tx.select({ provider: payments.provider }).from(payments).where(eq(payments.orderId, input.orderId)).limit(1))[0];
  const company = await getCompanyDetails(tx);

  // Older orders have no GST saved on their lines: work it out from the product now.
  const rules = items.some((i) => i.gstRateBps == null) ? await productGstRules(tx, items.map((i) => i.productId)) : new Map();
  const pickup = (seller.shipping as { pickup?: { line1?: string; line2?: string | null; city?: string; state?: string; postalCode?: string } } | null)?.pickup;
  const sellerState = pickup?.state || seller.s.businessState || "";
  const buyer = order.shippingAddressSnapshot;
  const interState = isInterStateSupply(sellerState, buyer.state);
  const charged = seller.s.taxIdentityType === "GSTIN";
  const computed = invoiceLines(items.map((i) => {
    const gst = i.gstRateBps != null ? { hsnCode: i.hsnCode, gstRateBps: i.gstRateBps } : orderLineGst(rules.get(i.productId), i);
    return { title: i.title, sku: i.sku, hsnCode: gst.hsnCode, gstRateBps: gst.gstRateBps, quantity: i.quantity, unitPricePaise: i.unitPricePaise, discountPaise: i.sellerDiscountPaise };
  }), { interState, charged });
  // A coupon LOIMART pays for: this seller's share of it, by value (the customer paid that much less).
  const orderGross = allItems.reduce((n, i) => n + i.unitPricePaise * i.quantity, 0);
  const platformDiscount = Math.max(0, order.discountPaise - allItems.reduce((n, i) => n + i.sellerDiscountPaise, 0));
  const platformDiscountPaise = orderGross ? Math.round(platformDiscount * computed.totals.grossPaise / orderGross) : 0;

  const details: InvoiceDetails = {
    seller: {
      legalName: seller.s.legalName, storeName: seller.s.storeName, gstin: seller.s.gstin, gstEnrolmentId: seller.s.gstEnrolmentId, pan: seller.s.pan,
      address: pickup ? oneLine(pickup) : sellerState, state: sellerState, stateCode: gstStateCode(sellerState),
    },
    buyer: { name: buyer.name ?? "Customer", phone: buyer.phone ?? null, address: oneLine(buyer), state: buyer.state, stateCode: gstStateCode(buyer.state) },
    marketplace: { name: company.tradeName, legalName: company.legalName, gstin: company.gstin, address: company.address },
    orderNumber: order.orderNumber, orderDate: order.createdAt.toISOString(),
    placeOfSupply: `${buyer.state}${gstStateCode(buyer.state) ? ` (${gstStateCode(buyer.state)})` : ""}`,
    interState, paymentMethod: payment?.provider === "COD" ? "Cash on Delivery" : payment?.provider ?? "—",
    lines: computed.lines.map((l, index) => ({ ...l, orderItemId: items[index]!.id })),
    platformDiscountPaise,
  };
  return insertInvoice(tx, {
    kind: charged ? "TAX_INVOICE" : "BILL_OF_SUPPLY", orderId: input.orderId, sellerId: input.sellerId, sourceKey, details,
    isTest: testProvidersAllowed() || !company.gstin, actorUserId: input.actorUserId ?? null,
  });
}

/**
 * Issues a credit note reversing all or part of an invoice: the whole parcel
 * when it came back undelivered or returned, or the returned pieces.
 * `quantities` (order item id → pieces) limits it to a customer return.
 */
export async function issueCreditNote(tx: Tx, input: { orderId: string; sellerId: string; sourceKey: string; reason: string; quantities?: Map<string, number>; actorUserId?: string | null }) {
  const existing = (await tx.select().from(invoices).where(eq(invoices.sourceKey, input.sourceKey)).limit(1))[0];
  if (existing) return existing;
  const original = (await tx.select().from(invoices).where(eq(invoices.sourceKey, `ORDER:${input.orderId}:${input.sellerId}`)).limit(1))[0];
  if (!original) return null; // Nothing was invoiced, so there is nothing to reverse.
  const lines = original.details.lines.flatMap((l) => {
    const qty = input.quantities ? Math.min(l.quantity, input.quantities.get(l.orderItemId ?? "") ?? 0) : l.quantity;
    if (qty <= 0) return [];
    const share = (paise: number) => Math.round(paise * qty / l.quantity);
    return [{ ...l, quantity: qty, grossPaise: share(l.grossPaise), discountPaise: share(l.discountPaise), netPaise: share(l.netPaise), taxablePaise: share(l.taxablePaise), cgstPaise: share(l.cgstPaise), sgstPaise: share(l.sgstPaise), igstPaise: share(l.igstPaise) }];
  });
  if (!lines.length) return null;
  const share = original.details.lines.reduce((n, l) => n + l.grossPaise, 0);
  const details: InvoiceDetails = {
    ...original.details, lines,
    platformDiscountPaise: share ? Math.round(original.details.platformDiscountPaise * lines.reduce((n, l) => n + l.grossPaise, 0) / share) : 0,
    original: { number: original.number, issuedAt: original.issuedAt.toISOString() }, reason: input.reason,
  };
  return insertInvoice(tx, { kind: "CREDIT_NOTE", orderId: input.orderId, sellerId: input.sellerId, sourceKey: input.sourceKey, originalInvoiceId: original.id, details, isTest: original.isTest, actorUserId: input.actorUserId ?? null });
}

/** Credit note for a customer return the seller has received back. */
export async function issueReturnCreditNote(tx: Tx, returnId: string, actorUserId: string | null) {
  const ret = (await tx.select({ orderId: returns.orderId, sellerId: returns.sellerId }).from(returns).where(eq(returns.id, returnId)).limit(1))[0];
  if (!ret) return null;
  const rows = await tx.select({ orderItemId: returnItems.orderItemId, quantity: returnItems.quantity }).from(returnItems).where(eq(returnItems.returnId, returnId));
  return issueCreditNote(tx, { ...ret, sourceKey: `RETURN:${returnId}`, reason: "Goods returned by the customer", quantities: new Map(rows.map((r) => [r.orderItemId, r.quantity])), actorUserId });
}

/** Invoices and credit notes for an order, optionally only one seller's. */
export async function orderInvoices(db: Executor, orderId: string, sellerId?: string) {
  return db.select({ id: invoices.id, kind: invoices.kind, number: invoices.number, issuedAt: invoices.issuedAt, totalPaise: invoices.totalPaise, sellerId: invoices.sellerId, isTest: invoices.isTest })
    .from(invoices).where(sellerId ? and(eq(invoices.orderId, orderId), eq(invoices.sellerId, sellerId)) : eq(invoices.orderId, orderId)).orderBy(invoices.issuedAt);
}
