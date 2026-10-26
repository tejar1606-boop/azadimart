import { AppError } from "@azadimart/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { recordReturnAfterSettlement } from "./fee-invoices";
import { issueReturnCreditNote } from "./invoices";
import { auditLogs, customers, customerWalletEntries, sellers, inventory, inventoryMovements, orderItems, orders, payments, refunds, returnItems, returns } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type ReturnStatus = typeof returns.$inferSelect.status;

/** Who may move a return where. LOIMART (admin) can also reject at any open step and settle disputes. */
export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED"],
  APPROVED: ["PICKUP_SCHEDULED", "REJECTED"],
  PICKUP_SCHEDULED: ["RECEIVED", "REJECTED"],
  RECEIVED: [],
  REFUNDED: [],
  REJECTED: [],
};

/**
 * Moves a return one step (seller or admin). On RECEIVED: stock goes back,
 * a credit note reverses the seller's invoice, money already paid to the
 * seller is recovered from their next payout, and the order becomes RETURNED
 * once every piece is back.
 */
export async function changeReturnStatus(tx: Tx, input: { returnId: string; next: ReturnStatus; actorUserId: string; sellerId?: string; notes?: string | null; by: "SELLER" | "ADMIN" }) {
  const current = (await tx.select({ id: returns.id, orderId: returns.orderId, sellerId: returns.sellerId, status: returns.status }).from(returns)
    .where(input.sellerId ? and(eq(returns.id, input.returnId), eq(returns.sellerId, input.sellerId)) : eq(returns.id, input.returnId)).limit(1))[0];
  if (!current) throw new AppError("NOT_FOUND", "Return request not found");
  if (current.status === input.next) return { id: current.id, status: current.status, orderStatus: null as string | null };
  if (!RETURN_TRANSITIONS[current.status]?.includes(input.next)) throw new AppError("CONFLICT", `Cannot move return from ${current.status} to ${input.next}`);
  const notes = input.notes?.trim().slice(0, 500) || null;
  if (input.next === "REJECTED" && !notes) throw new AppError("VALIDATION_ERROR", "Give a reason for rejecting the return (the customer sees it)");

  if (input.next === "RECEIVED") {
    const items = await tx.select({ variantId: orderItems.variantId, quantity: returnItems.quantity }).from(returnItems)
      .innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId)).where(eq(returnItems.returnId, current.id));
    for (const item of items) {
      await tx.update(inventory).set({ onHand: sql`${inventory.onHand} + ${item.quantity}`, updatedAt: new Date() }).where(eq(inventory.variantId, item.variantId));
      await tx.insert(inventoryMovements).values({ variantId: item.variantId, movementType: "RETURN", quantity: item.quantity, referenceType: "CUSTOMER_RETURN", referenceId: current.orderId, notes: notes ?? "Returned item received", createdByUserId: input.actorUserId });
    }
  }

  const updated = (await tx.update(returns).set({ status: input.next, ...(input.next === "REJECTED" ? { rejectionReason: notes } : {}), updatedAt: new Date() })
    .where(and(eq(returns.id, current.id), eq(returns.status, current.status))).returning({ id: returns.id, status: returns.status }))[0];
  if (!updated) throw new AppError("CONFLICT", "Return changed; please retry");

  let orderStatus: string | null = null;
  if (input.next === "RECEIVED") {
    await issueReturnCreditNote(tx, current.id, input.actorUserId);
    const returned = await tx.select({ orderItemId: returnItems.orderItemId, quantity: returnItems.quantity }).from(returnItems).where(eq(returnItems.returnId, current.id));
    await recordReturnAfterSettlement(tx, { sellerId: current.sellerId, sourceKey: `RETURN:${current.id}`, quantities: new Map(returned.map((r) => [r.orderItemId, r.quantity])), actorUserId: input.actorUserId });
    const allItems = await tx.select({ id: orderItems.id, quantity: orderItems.quantity }).from(orderItems).where(eq(orderItems.orderId, current.orderId));
    const back = await tx.select({ orderItemId: returnItems.orderItemId, quantity: returnItems.quantity }).from(returnItems)
      .innerJoin(returns, eq(returns.id, returnItems.returnId)).where(and(eq(returns.orderId, current.orderId), inArray(returns.status, ["RECEIVED", "REFUNDED"])));
    const totals = new Map<string, number>();
    for (const row of back) totals.set(row.orderItemId, (totals.get(row.orderItemId) ?? 0) + row.quantity);
    if (allItems.length > 0 && allItems.every((item) => (totals.get(item.id) ?? 0) >= item.quantity)) {
      await tx.update(orders).set({ status: "RETURNED", updatedAt: new Date() }).where(and(eq(orders.id, current.orderId), eq(orders.status, "DELIVERED")));
      orderStatus = "RETURNED";
    }
  }
  await tx.insert(auditLogs).values({
    actorUserId: input.actorUserId, action: "RETURN_STATUS_CHANGED", entityType: "return", entityId: current.id,
    metadata: { orderId: current.orderId, from: current.status, to: input.next, by: input.by, notes },
  });
  return { id: updated.id, status: updated.status, orderStatus };
}

/**
 * What the customer gets back for a return: what they paid for those pieces.
 * Each line's price less the seller's coupon, less its share of LOIMART's
 * discount; the part paid with LOIMART wallet money goes back to the wallet,
 * the rest to the customer. Delivery and the platform fee aren't refunded.
 */
export async function returnRefundQuote(db: Db | Tx, returnId: string) {
  const ret = (await db.select({ id: returns.id, orderId: returns.orderId, status: returns.status }).from(returns).where(eq(returns.id, returnId)).limit(1))[0];
  if (!ret) throw new AppError("NOT_FOUND", "Return request not found");
  const [order] = await db.select({ discountPaise: orders.discountPaise, walletPaise: orders.walletPaise }).from(orders).where(eq(orders.id, ret.orderId));
  const lines = await db.select({ id: orderItems.id, quantity: orderItems.quantity, unit: orderItems.unitPricePaise, sellerDiscount: orderItems.sellerDiscountPaise }).from(orderItems).where(eq(orderItems.orderId, ret.orderId));
  const back = await db.select({ orderItemId: returnItems.orderItemId, quantity: returnItems.quantity }).from(returnItems).where(eq(returnItems.returnId, returnId));
  const net = (l: (typeof lines)[number]) => l.unit * l.quantity - l.sellerDiscount;
  const itemsNet = lines.reduce((s, l) => s + net(l), 0);
  const otherDiscount = Math.max(0, (order?.discountPaise ?? 0) - lines.reduce((s, l) => s + l.sellerDiscount, 0));
  let goods = 0;
  for (const b of back) { const l = lines.find((x) => x.id === b.orderItemId); if (l) goods += net(l) * b.quantity / l.quantity; }
  const share = itemsNet ? goods / itemsNet : 0;
  const lessDiscount = Math.round(otherDiscount * share);
  const toWalletPaise = Math.round((order?.walletPaise ?? 0) * share);
  const toCustomerPaise = Math.max(0, Math.round(goods) - lessDiscount - toWalletPaise);
  const [pay] = await db.select({ id: payments.id, provider: payments.provider, status: payments.status, amountPaise: payments.amountPaise,
    refunded: sql<number>`(select coalesce(sum(${refunds.amountPaise}), 0)::int from ${refunds} where ${refunds.paymentId} = ${payments.id} and ${refunds.status} <> 'FAILED')` })
    .from(payments).where(eq(payments.orderId, ret.orderId)).orderBy(sql`${payments.createdAt} desc`).limit(1);
  return {
    returnId, orderId: ret.orderId, status: ret.status,
    goodsPaise: Math.round(goods), lessDiscountPaise: lessDiscount, toWalletPaise, toCustomerPaise,
    payment: pay ? { id: pay.id, method: pay.provider, status: pay.status, refundablePaise: Math.max(0, pay.amountPaise - Number(pay.refunded)) } : null,
  };
}

/**
 * Records a return as refunded: wallet money goes back to the wallet, and the
 * customer's money is recorded as a completed refund (sent through the payment
 * gateway by the caller, or paid by bank transfer/UPI with its reference).
 */
export async function markReturnRefunded(tx: Tx, input: { returnId: string; amountPaise: number; toWalletPaise: number; paymentId: string | null; reference: string; providerRefundId?: string | null; actorUserId: string }) {
  const [ret] = await tx.select({ orderId: returns.orderId, status: returns.status }).from(returns).where(eq(returns.id, input.returnId)).for("update");
  if (!ret) throw new AppError("NOT_FOUND", "Return request not found");
  if (ret.status !== "RECEIVED") throw new AppError("CONFLICT", ret.status === "REFUNDED" ? "This return is already refunded" : "Refund once the item is received back");
  if (input.amountPaise > 0) {
    if (!input.paymentId) throw new AppError("CONFLICT", "This order has no payment to refund");
    await tx.insert(refunds).values({ paymentId: input.paymentId, orderId: ret.orderId, amountPaise: input.amountPaise, status: "COMPLETED", idempotencyKey: `return:${input.returnId}`, reason: `Return refund · ${input.reference}`.slice(0, 300), providerRefundId: input.providerRefundId ?? `MANUAL:${input.returnId}` });
    const [pay] = await tx.select({ provider: payments.provider, amountPaise: payments.amountPaise,
      refunded: sql<number>`(select coalesce(sum(${refunds.amountPaise}), 0)::int from ${refunds} where ${refunds.paymentId} = ${payments.id} and ${refunds.status} = 'COMPLETED')` })
      .from(payments).where(eq(payments.id, input.paymentId));
    // Online payments show as (partly) refunded; Cash on Delivery stays "paid at delivery", the refund went by bank/UPI.
    if (pay && pay.provider !== "COD") await tx.update(payments).set({ status: Number(pay.refunded) >= pay.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED", updatedAt: new Date() }).where(eq(payments.id, input.paymentId));
  }
  if (input.toWalletPaise > 0) {
    const [o] = await tx.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, ret.orderId));
    await tx.insert(customerWalletEntries).values({ customerId: o!.customerId, kind: "ADJUSTMENT", amountPaise: input.toWalletPaise, remainingPaise: input.toWalletPaise, orderId: ret.orderId, note: "Wallet money back for a returned item", createdByUserId: input.actorUserId });
  }
  await tx.update(returns).set({ status: "REFUNDED", updatedAt: new Date() }).where(eq(returns.id, input.returnId));
  await tx.insert(auditLogs).values({ actorUserId: input.actorUserId, action: "RETURN_REFUNDED", entityType: "return", entityId: input.returnId, metadata: { orderId: ret.orderId, amountPaise: input.amountPaise, toWalletPaise: input.toWalletPaise, reference: input.reference } });
}

export type ReturnRow = {
  id: string; status: ReturnStatus; reason: string | null; rejectionReason: string | null; createdAt: Date; updatedAt: Date;
  orderId: string; orderNumber: string; deliveredAt: Date | null; customerName: string; city: string | null; state: string | null;
  sellerId: string; storeName: string;
  items: Array<{ orderItemId: string; title: string; sku: string; quantity: number; unitPricePaise: number; reason: string | null }>;
};

/** Returns, newest first: all of them (LOIMART) or one seller's, by status and search (order number, customer, seller, product). */
export async function listReturns(db: Db, input: { sellerId?: string; status?: ReturnStatus | "OPEN" | "ALL"; q?: string; page?: number; pageSize?: number }) {
  const pageSize = input.pageSize ?? 50, page = Math.max(1, input.page ?? 1);
  const where = [];
  if (input.sellerId) where.push(eq(returns.sellerId, input.sellerId));
  if (input.status === "OPEN") where.push(inArray(returns.status, ["REQUESTED", "APPROVED", "PICKUP_SCHEDULED", "RECEIVED"]));
  else if (input.status && input.status !== "ALL") where.push(eq(returns.status, input.status));
  const q = input.q?.trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => "\\" + c)}%`;
    where.push(sql`(${orders.orderNumber} ilike ${like} or ${customers.fullName} ilike ${like} or ${sellers.storeName} ilike ${like}
      or exists (select 1 from ${returnItems} ri join ${orderItems} oi on oi.id = ri.order_item_id where ri.return_id = ${returns.id} and (oi.title ilike ${like} or oi.sku ilike ${like})))`);
  }
  const filter = where.length ? and(...where) : undefined;
  const base = () => db.select({
    id: returns.id, status: returns.status, reason: returns.reason, rejectionReason: returns.rejectionReason, createdAt: returns.createdAt, updatedAt: returns.updatedAt,
    orderId: orders.id, orderNumber: orders.orderNumber, deliveredAt: orders.deliveredAt, customerName: customers.fullName,
    city: sql<string | null>`${orders.shippingAddressSnapshot}->>'city'`, state: sql<string | null>`${orders.shippingAddressSnapshot}->>'state'`,
    sellerId: sellers.id, storeName: sellers.storeName,
  }).from(returns).innerJoin(orders, eq(orders.id, returns.orderId)).innerJoin(customers, eq(customers.id, orders.customerId)).innerJoin(sellers, eq(sellers.id, returns.sellerId));
  const countBase = () => db.select({ status: returns.status, n: sql<number>`count(*)::int` }).from(returns).innerJoin(orders, eq(orders.id, returns.orderId)).innerJoin(customers, eq(customers.id, orders.customerId)).innerJoin(sellers, eq(sellers.id, returns.sellerId));
  const countWhere = [input.sellerId ? eq(returns.sellerId, input.sellerId) : undefined].filter(Boolean);
  const [rows, counts] = await Promise.all([
    base().where(filter).orderBy(sql`${returns.createdAt} desc`).limit(pageSize).offset((page - 1) * pageSize),
    countBase().where(countWhere.length ? and(...countWhere) : undefined).groupBy(returns.status),
  ]);
  const ids = rows.map((r) => r.id);
  const items = ids.length ? await db.select({ returnId: returnItems.returnId, orderItemId: returnItems.orderItemId, quantity: returnItems.quantity, reason: returnItems.reason, title: orderItems.title, sku: orderItems.sku, unitPricePaise: orderItems.unitPricePaise })
    .from(returnItems).innerJoin(orderItems, eq(orderItems.id, returnItems.orderItemId)).where(inArray(returnItems.returnId, ids)) : [];
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Partial<Record<ReturnStatus, number>>;
  const total = filter ? Number((await db.select({ n: sql<number>`count(*)::int` }).from(returns).innerJoin(orders, eq(orders.id, returns.orderId)).innerJoin(customers, eq(customers.id, orders.customerId)).innerJoin(sellers, eq(sellers.id, returns.sellerId)).where(filter))[0]?.n ?? 0) : Object.values(byStatus).reduce((s, n) => s + n, 0);
  return {
    items: rows.map((r) => ({ ...r, items: items.filter((i) => i.returnId === r.id).map(({ returnId: _r, ...i }) => i) })) as ReturnRow[],
    counts: byStatus, total, page, pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
