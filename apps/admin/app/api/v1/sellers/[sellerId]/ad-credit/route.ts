import { requireApiAccess } from "@azadimart/auth";
import { adBudget, auditLogs, createDatabase, sellers } from "@azadimart/database";
import { AppError, adCreditLimitSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ sellerId: string }> };

/** The seller's ad budget: upcoming earnings + credit limit − ads owed/committed. */
export async function GET(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { sellerId } = await params;
    if (!uuidSchema.safeParse(sellerId).success) throw new AppError("NOT_FOUND", "Seller not found");
    const db = createDatabase();
    const seller = (await db.select({ limit: sellers.adCreditLimitPaise }).from(sellers).where(eq(sellers.id, sellerId)).limit(1))[0];
    if (!seller) throw new AppError("NOT_FOUND", "Seller not found");
    return NextResponse.json({ customLimitPaise: seller.limit, budget: await adBudget(db, sellerId) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Set this seller's ad credit (null = AzadiMart's default). */
export async function PUT(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { sellerId } = await params;
    if (!uuidSchema.safeParse(sellerId).success) throw new AppError("NOT_FOUND", "Seller not found");
    const { limitPaise } = adCreditLimitSchema.parse(await request.json());
    const db = createDatabase();
    const [seller] = await db.update(sellers).set({ adCreditLimitPaise: limitPaise, updatedAt: new Date() }).where(eq(sellers.id, sellerId)).returning({ id: sellers.id });
    if (!seller) throw new AppError("NOT_FOUND", "Seller not found");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "AD_CREDIT_LIMIT_SET", entityType: "seller", entityId: sellerId, metadata: { limitPaise } });
    return NextResponse.json({ ok: true, budget: await adBudget(db, sellerId) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
