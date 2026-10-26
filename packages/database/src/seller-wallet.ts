import { AppError, SELLER_WALLET_MAX_PAISE, walletRoomPaise } from "@azadimart/shared";
import { and, eq, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import { auditLogs, sellerWalletTopUps, sellerWalletTransactions, sellers, shipments } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const rupees = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Locks the seller row and returns the current wallet balance. */
async function lockBalance(tx: Tx, sellerId: string): Promise<number> {
  const row = (await tx.select({ balance: sellers.walletBalancePaise }).from(sellers).where(eq(sellers.id, sellerId)).limit(1).for("update"))[0];
  if (!row) throw new AppError("NOT_FOUND", "Seller not found");
  return row.balance;
}

async function move(tx: Tx, input: { sellerId: string; type: "TOP_UP" | "COURIER_CHARGE" | "COURIER_REFUND" | "ADJUSTMENT"; amountPaise: number; balanceBefore: number; shipmentId?: string; topUpId?: string; note?: string; userId?: string | null }) {
  const after = input.balanceBefore + input.amountPaise;
  await tx.update(sellers).set({ walletBalancePaise: after }).where(eq(sellers.id, input.sellerId));
  await tx.insert(sellerWalletTransactions).values({ sellerId: input.sellerId, type: input.type, amountPaise: input.amountPaise, balanceAfterPaise: after, shipmentId: input.shipmentId ?? null, topUpId: input.topUpId ?? null, note: input.note ?? null, createdByUserId: input.userId ?? null });
  return after;
}

/**
 * Pays a LOIMART courier booking from the wallet, as much as the balance
 * covers; any shortfall comes off the seller's next payout (settlements use
 * shipping_fee_paise - wallet_paid_paise). Returns the wallet part.
 */
export async function chargeCourierFromWallet(tx: Tx, input: { sellerId: string; shipmentId: string; feePaise: number }): Promise<number> {
  if (input.feePaise <= 0) return 0;
  const balance = await lockBalance(tx, input.sellerId);
  const fromWallet = Math.min(balance, input.feePaise);
  if (fromWallet > 0) {
    const short = input.feePaise - fromWallet;
    await move(tx, { sellerId: input.sellerId, type: "COURIER_CHARGE", amountPaise: -fromWallet, balanceBefore: balance, shipmentId: input.shipmentId, note: short ? `Courier fee ${rupees(input.feePaise)}: ${rupees(short)} from your next payout` : `Courier fee ${rupees(input.feePaise)}` });
  }
  await tx.update(shipments).set({ walletPaidPaise: fromWallet }).where(eq(shipments.id, input.shipmentId));
  return fromWallet;
}

/** A cancelled or failed LOIMART parcel gives its wallet part back (once). Refunds may go above ₹500. */
export async function refundCourierToWallet(tx: Tx, shipmentId: string, userId?: string | null): Promise<number> {
  const row = (await tx.select({ sellerId: shipments.sellerId, paid: shipments.walletPaidPaise }).from(shipments).where(eq(shipments.id, shipmentId)).limit(1).for("update"))[0];
  if (!row || row.paid <= 0) return 0;
  const balance = await lockBalance(tx, row.sellerId);
  await move(tx, { sellerId: row.sellerId, type: "COURIER_REFUND", amountPaise: row.paid, balanceBefore: balance, shipmentId, note: "Parcel cancelled: courier fee returned", userId });
  await tx.update(shipments).set({ walletPaidPaise: 0 }).where(eq(shipments.id, shipmentId));
  return row.paid;
}

/** Seller asks to add money they paid to LOIMART (bank transfer / UPI) with a screenshot of the payment. Must fit under ₹500 with other waiting requests. */
export async function requestWalletTopUp(db: Db, input: { sellerId: string; amountPaise: number; reference: string; userId: string; proof: { key: string; mimeType: string } }): Promise<string> {
  return db.transaction(async (tx) => {
    const balance = await lockBalance(tx, input.sellerId);
    const pending = Number((await tx.select({ n: sql<number>`coalesce(sum(${sellerWalletTopUps.amountPaise}), 0)::int` }).from(sellerWalletTopUps)
      .where(and(eq(sellerWalletTopUps.sellerId, input.sellerId), eq(sellerWalletTopUps.status, "PENDING"))))[0]?.n ?? 0);
    const room = walletRoomPaise(balance, pending);
    if (input.amountPaise > room) throw new AppError("VALIDATION_ERROR", room ? `You can add up to ${rupees(room)} right now (the wallet holds at most ${rupees(SELLER_WALLET_MAX_PAISE)}).` : `Your wallet is full (${rupees(SELLER_WALLET_MAX_PAISE)} including requests waiting for approval).`);
    const used = (await tx.select({ id: sellerWalletTopUps.id }).from(sellerWalletTopUps)
      .where(and(sql`upper(${sellerWalletTopUps.reference}) = ${input.reference.toUpperCase()}`, sql`${sellerWalletTopUps.status} <> 'REJECTED'`)).limit(1))[0];
    if (used) throw new AppError("CONFLICT", "This payment reference was already sent. Check your wallet history.");
    const row = (await tx.insert(sellerWalletTopUps).values({ sellerId: input.sellerId, amountPaise: input.amountPaise, reference: input.reference.toUpperCase(), proofKey: input.proof.key, proofMimeType: input.proof.mimeType }).returning({ id: sellerWalletTopUps.id }))[0]!;
    await tx.insert(auditLogs).values({ actorUserId: input.userId, action: "WALLET_TOP_UP_REQUESTED", entityType: "seller_wallet_top_up", entityId: row.id, metadata: { sellerId: input.sellerId, amountPaise: input.amountPaise, reference: input.reference } });
    return row.id;
  });
}

/** Admin approves (credits the wallet, never above ₹500) or rejects a top-up request. */
export async function decideWalletTopUp(db: Db, input: { topUpId: string; decision: "APPROVE" | "REJECT"; note?: string; adminUserId: string }): Promise<{ balancePaise: number | null }> {
  return db.transaction(async (tx) => {
    const topUp = (await tx.select().from(sellerWalletTopUps).where(eq(sellerWalletTopUps.id, input.topUpId)).limit(1).for("update"))[0];
    if (!topUp) throw new AppError("NOT_FOUND", "Top-up request not found");
    if (topUp.status !== "PENDING") throw new AppError("CONFLICT", "This request was already decided");
    let balancePaise: number | null = null;
    if (input.decision === "APPROVE") {
      const balance = await lockBalance(tx, topUp.sellerId);
      if (balance + topUp.amountPaise > SELLER_WALLET_MAX_PAISE) throw new AppError("CONFLICT", `Approving would take the wallet above ${rupees(SELLER_WALLET_MAX_PAISE)} (balance now ${rupees(balance)}). Reject it and ask the seller to send a smaller amount.`);
      balancePaise = await move(tx, { sellerId: topUp.sellerId, type: "TOP_UP", amountPaise: topUp.amountPaise, balanceBefore: balance, topUpId: topUp.id, note: `Top-up · ref ${topUp.reference}`, userId: input.adminUserId });
    }
    await tx.update(sellerWalletTopUps).set({ status: input.decision === "APPROVE" ? "APPROVED" : "REJECTED", adminNote: input.note ?? null, decidedByUserId: input.adminUserId, decidedAt: new Date(), updatedAt: new Date() }).where(eq(sellerWalletTopUps.id, topUp.id));
    await tx.insert(auditLogs).values({ actorUserId: input.adminUserId, action: input.decision === "APPROVE" ? "WALLET_TOP_UP_APPROVED" : "WALLET_TOP_UP_REJECTED", entityType: "seller_wallet_top_up", entityId: topUp.id, metadata: { sellerId: topUp.sellerId, amountPaise: topUp.amountPaise, note: input.note ?? null } });
    return { balancePaise };
  });
}
