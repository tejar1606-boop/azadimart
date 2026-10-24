import { requireStaff } from "@azadimart/auth";
import { createDatabase, customerWalletEntries, customers, setPlatformSetting, signupBonusClaims, walletSettings } from "@azadimart/database";
import { CUSTOMER_WALLET_KEY, toApiError, walletSettingsSchema } from "@azadimart/shared";
import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Wallet rules, the numbers (bonuses given, used, refused by reason) and recent claims. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireStaff(request, "marketing");
    const db = createDatabase();
    const [settings, totals, reasons, claims] = await Promise.all([
      walletSettings(db),
      db.select({
        given: sql<number>`coalesce(sum(${customerWalletEntries.amountPaise}) filter (where ${customerWalletEntries.kind} = 'SIGNUP_BONUS'), 0)::int`,
        bonuses: sql<number>`count(*) filter (where ${customerWalletEntries.kind} = 'SIGNUP_BONUS')::int`,
        spent: sql<number>`coalesce(-sum(${customerWalletEntries.amountPaise}) filter (where ${customerWalletEntries.kind} = 'ORDER_SPEND'), 0)::int`,
        refunded: sql<number>`coalesce(sum(${customerWalletEntries.amountPaise}) filter (where ${customerWalletEntries.kind} = 'ORDER_REFUND'), 0)::int`,
        outstanding: sql<number>`coalesce(sum(${customerWalletEntries.remainingPaise}) filter (where ${customerWalletEntries.expiresAt} is null or ${customerWalletEntries.expiresAt} > now()), 0)::int`,
        expired: sql<number>`coalesce(sum(${customerWalletEntries.remainingPaise}) filter (where ${customerWalletEntries.expiresAt} <= now()), 0)::int`,
      }).from(customerWalletEntries).then((r) => r[0]!),
      db.select({ reason: signupBonusClaims.reason, n: sql<number>`count(*)::int` }).from(signupBonusClaims).where(eq(signupBonusClaims.status, "BLOCKED")).groupBy(signupBonusClaims.reason),
      db.select({ id: signupBonusClaims.id, status: signupBonusClaims.status, reason: signupBonusClaims.reason, phone: signupBonusClaims.phone, deviceId: signupBonusClaims.deviceId, ipAddress: signupBonusClaims.ipAddress, createdAt: signupBonusClaims.createdAt, customerName: customers.fullName })
        .from(signupBonusClaims).leftJoin(customers, eq(customers.id, signupBonusClaims.customerId)).orderBy(desc(signupBonusClaims.createdAt)).limit(100),
    ]);
    return NextResponse.json({ settings, totals, reasons, claims: claims.map((c) => ({ ...c, phone: "******" + c.phone.slice(-4), deviceId: c.deviceId ? c.deviceId.slice(0, 8) + "…" : null })) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "marketing");
    const settings = walletSettingsSchema.parse(await request.json());
    await setPlatformSetting(createDatabase(), CUSTOMER_WALLET_KEY, settings, principal.userId);
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
