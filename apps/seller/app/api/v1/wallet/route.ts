import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, getPlatformSetting, sellerWalletTopUps, sellerWalletTransactions, sellers, shipments, orders } from "@azadimart/database";
import { AppError, SELLER_WALLET_MAX_PAISE, WALLET_PAYMENT_DETAILS_KEY, toApiError, walletRoomPaise, type WalletPaymentDetails } from "@azadimart/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** The seller's courier wallet: balance, how much more fits, history and top-up requests. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const db = createDatabase();
    const sellerId = principal.sellerId;
    const [seller, history, topUps] = await Promise.all([
      db.select({ balance: sellers.walletBalancePaise }).from(sellers).where(eq(sellers.id, sellerId)).limit(1).then((r) => r[0]),
      db.select({ id: sellerWalletTransactions.id, type: sellerWalletTransactions.type, amountPaise: sellerWalletTransactions.amountPaise, balanceAfterPaise: sellerWalletTransactions.balanceAfterPaise, note: sellerWalletTransactions.note, createdAt: sellerWalletTransactions.createdAt, orderNumber: orders.orderNumber })
        .from(sellerWalletTransactions).leftJoin(shipments, eq(shipments.id, sellerWalletTransactions.shipmentId)).leftJoin(orders, eq(orders.id, shipments.orderId))
        .where(eq(sellerWalletTransactions.sellerId, sellerId)).orderBy(desc(sellerWalletTransactions.createdAt)).limit(100),
      db.select({ id: sellerWalletTopUps.id, amountPaise: sellerWalletTopUps.amountPaise, reference: sellerWalletTopUps.reference, hasProof: sql<boolean>`${sellerWalletTopUps.proofKey} is not null`, status: sellerWalletTopUps.status, adminNote: sellerWalletTopUps.adminNote, createdAt: sellerWalletTopUps.createdAt })
        .from(sellerWalletTopUps).where(eq(sellerWalletTopUps.sellerId, sellerId)).orderBy(desc(sellerWalletTopUps.createdAt)).limit(20),
    ]);
    const balance = seller?.balance ?? 0;
    const pending = topUps.filter((t) => t.status === "PENDING").reduce((n, t) => n + t.amountPaise, 0);
    const [spent] = await db.select({ n: sql<number>`coalesce(-sum(${sellerWalletTransactions.amountPaise}), 0)::int` }).from(sellerWalletTransactions)
      .where(and(eq(sellerWalletTransactions.sellerId, sellerId), eq(sellerWalletTransactions.type, "COURIER_CHARGE"), sql`${sellerWalletTransactions.createdAt} > now() - interval '30 days'`));
    return NextResponse.json({
      balancePaise: balance, maxPaise: SELLER_WALLET_MAX_PAISE, pendingPaise: pending, roomPaise: walletRoomPaise(balance, pending),
      spentLast30DaysPaise: spent?.n ?? 0, history, topUps,
      // Where to pay top-ups (set in Admin → Finance → Seller wallets).
      paymentDetails: await getPlatformSetting<WalletPaymentDetails>(db, WALLET_PAYMENT_DETAILS_KEY),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
