import { requireStaff } from "@azadimart/auth";
import { createDatabase, sellerWalletTopUps, sellerWalletTransactions, sellers } from "@azadimart/database";
import { SELLER_WALLET_MAX_PAISE, toApiError } from "@azadimart/shared";
import { asc, desc, eq, gt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Seller courier wallets: top-up requests (waiting first) and every seller's balance. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "payments");
    const db = createDatabase();
    const [topUps, balances] = await Promise.all([
      db.select({ id: sellerWalletTopUps.id, sellerId: sellerWalletTopUps.sellerId, storeName: sellers.storeName, balancePaise: sellers.walletBalancePaise, amountPaise: sellerWalletTopUps.amountPaise, reference: sellerWalletTopUps.reference, hasProof: sql<boolean>`${sellerWalletTopUps.proofKey} is not null`, status: sellerWalletTopUps.status, adminNote: sellerWalletTopUps.adminNote, createdAt: sellerWalletTopUps.createdAt, decidedAt: sellerWalletTopUps.decidedAt })
        .from(sellerWalletTopUps).innerJoin(sellers, eq(sellers.id, sellerWalletTopUps.sellerId))
        .orderBy(sql`(${sellerWalletTopUps.status} = 'PENDING') desc`, desc(sellerWalletTopUps.createdAt)).limit(200),
      db.select({ sellerId: sellers.id, storeName: sellers.storeName, balancePaise: sellers.walletBalancePaise,
        lastActivity: sql<string | null>`(select max(t.created_at) from seller_wallet_transactions t where t.seller_id = ${sellers.id})` })
        .from(sellers).where(or(gt(sellers.walletBalancePaise, 0), sql`exists (select 1 from ${sellerWalletTransactions} t where t.seller_id = ${sellers.id})`)).orderBy(asc(sellers.storeName)),
    ]);
    return NextResponse.json({ maxPaise: SELLER_WALLET_MAX_PAISE, topUps, balances, totalHeldPaise: balances.reduce((n, b) => n + b.balancePaise, 0) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
