import { DEFAULT_ORDER_CASHBACK, ORDER_CASHBACK_KEY, type CashbackSettings } from "@azadimart/shared";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { returnWindowDays } from "./customer-referrals";
import { walletSettings } from "./customer-wallet";
import { getPlatformSetting } from "./platform-settings";
import { customerWalletEntries, orderCashbacks, orders } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Exec = Pick<Db, "select">;
const DAY = 24 * 60 * 60 * 1000;

/** Current cashback rules (Admin → Wallet & referrals), falling back to 2% up to ₹50. */
export async function cashbackSettings(db: Exec): Promise<CashbackSettings> {
  return { ...DEFAULT_ORDER_CASHBACK, ...((await getPlatformSetting<Partial<CashbackSettings>>(db, ORDER_CASHBACK_KEY)) ?? {}) };
}

/** A return or replacement still waiting for a decision: the cashback waits too (it may be rejected). */
const returnPending = sql`exists (select 1 from returns r where r.order_id = ${orders.id} and r.status = 'REQUESTED')`;
/** Something in the order is going back (or came back): no cashback. */
const sentBack = sql`(exists (select 1 from returns r where r.order_id = ${orders.id} and r.status not in ('REQUESTED', 'REJECTED'))
  or exists (select 1 from shipments sh where sh.order_id = ${orders.id} and sh.status = 'RETURNED'))`;
const paid = sql`exists (select 1 from payments p where p.order_id = ${orders.id} and p.status in ('CAPTURED', 'PARTIALLY_REFUNDED'))`;

/**
 * Daily job: orders delivered more than the return window ago with a cashback
 * promised get it in the shopper's wallet, unless something was returned or
 * replaced (then it's forfeited). The amount is the one shown at checkout,
 * even if Admin changed the rules since. Each order once. Sellers' payouts
 * take their share only for GRANTED cashback.
 */
export async function creditDueOrderCashback(db: Db, now = new Date()) {
  const result = { granted: 0, forfeited: 0 };
  const due = await db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.status, "DELIVERED"), gt(orders.cashbackPaise, 0), lte(orders.deliveredAt, new Date(now.getTime() - returnWindowDays() * DAY)),
      sql`not ${returnPending}`, sql`(${sentBack} or ${paid})`,
      sql`not exists (select 1 from order_cashbacks oc where oc.order_id = ${orders.id})`))
    .orderBy(orders.deliveredAt).limit(500);
  for (const row of due) {
    const outcome = await db.transaction((tx) => settleOrderCashback(tx, row.id, now));
    if (outcome) result[outcome]++;
  }
  return result;
}

async function settleOrderCashback(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], orderId: string, now: Date): Promise<"granted" | "forfeited" | null> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"order_cashback:" + orderId}, 0))`);
  if ((await tx.select({ id: orderCashbacks.id }).from(orderCashbacks).where(eq(orderCashbacks.orderId, orderId)).limit(1))[0]) return null;
  const order = (await tx.select({ customerId: orders.customerId, orderNumber: orders.orderNumber, cashbackPaise: orders.cashbackPaise, sentBack: sql<boolean>`${sentBack}` })
    .from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order || order.cashbackPaise <= 0) return null;
  if (order.sentBack) {
    await tx.insert(orderCashbacks).values({ orderId, customerId: order.customerId, status: "FORFEITED", reason: "An item in this order was returned or replaced." });
    return "forfeited";
  }
  const settings = await walletSettings(tx);
  const [entry] = await tx.insert(customerWalletEntries).values({
    customerId: order.customerId, kind: "ORDER_CASHBACK", amountPaise: order.cashbackPaise, remainingPaise: order.cashbackPaise, orderId,
    expiresAt: new Date(now.getTime() + settings.expiryDays * DAY), note: `Cashback for order ${order.orderNumber}`,
  }).returning({ id: customerWalletEntries.id });
  await tx.insert(orderCashbacks).values({ orderId, customerId: order.customerId, status: "GRANTED", amountPaise: order.cashbackPaise, walletEntryId: entry!.id });
  return "granted";
}

/** Where an order's cashback is, for the shopper's order page. */
export async function orderCashbackState(db: Exec, order: { id: string; status: string; cashbackPaise: number; deliveredAt: Date | null }) {
  if (order.cashbackPaise <= 0) return null;
  const row = (await db.select({ status: orderCashbacks.status, at: orderCashbacks.createdAt }).from(orderCashbacks).where(eq(orderCashbacks.orderId, order.id)).limit(1))[0];
  if (row?.status === "GRANTED") return { state: "ADDED" as const, amountPaise: order.cashbackPaise, at: row.at };
  if (row?.status === "FORFEITED" || ["CANCELLED", "RETURNED"].includes(order.status)) return { state: "NOT_GIVEN" as const, amountPaise: order.cashbackPaise, at: null };
  const dueAt = order.deliveredAt ? new Date(order.deliveredAt.getTime() + returnWindowDays() * DAY) : null;
  return { state: "PENDING" as const, amountPaise: order.cashbackPaise, at: dueAt };
}
