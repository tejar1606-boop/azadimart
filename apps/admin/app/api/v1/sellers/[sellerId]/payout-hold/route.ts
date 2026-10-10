import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, sellers } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Pause (with a reason the seller sees) or resume automatic payouts to a seller. */
export async function POST(request: Request, { params }: { params: Promise<{ sellerId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { sellerId } = await params;
    if (!uuidSchema.safeParse(sellerId).success) throw new AppError("NOT_FOUND", "Seller not found");
    const { hold, reason } = (await request.json().catch(() => ({}))) as { hold?: boolean; reason?: string };
    const note = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
    if (hold && note.length < 3) throw new AppError("VALIDATION_ERROR", "Give a reason for holding payouts");
    const db = createDatabase();
    const [seller] = await db.update(sellers).set({ payoutHoldReason: hold ? note : null, updatedAt: new Date() }).where(eq(sellers.id, sellerId)).returning({ id: sellers.id });
    if (!seller) throw new AppError("NOT_FOUND", "Seller not found");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: hold ? "PAYOUTS_HELD" : "PAYOUTS_RELEASED", entityType: "seller", entityId: sellerId, metadata: { reason: note || null } });
    return NextResponse.json({ ok: true, holdReason: hold ? note : null });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
