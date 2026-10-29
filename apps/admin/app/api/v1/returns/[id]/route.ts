import { requireStaff } from "@azadimart/auth";
import { changeReturnStatus, createDatabase, type ReturnStatus } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** LOIMART steps in on a return: approve, schedule pickup, mark received, or reject (with a reason the customer sees). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "orders");
    const { id } = await params;
    if (!uuidSchema.safeParse(id).success) throw new AppError("NOT_FOUND", "Return request not found");
    const body = (await request.json().catch(() => ({}))) as { status?: string; notes?: string };
    const next = body.status?.trim().toUpperCase();
    if (!next || !["APPROVED", "PICKUP_SCHEDULED", "RECEIVED", "REJECTED"].includes(next)) throw new AppError("VALIDATION_ERROR", "Invalid return status");
    const db = createDatabase();
    const result = await db.transaction((tx) => changeReturnStatus(tx, { returnId: id, next: next as ReturnStatus, actorUserId: principal.userId, notes: body.notes, by: "ADMIN" }));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
