import { auditLogs, supportCannedReplies } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireSupportStaff } from "../../staff";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ replyId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { db, userId } = await requireSupportStaff(request);
    const replyId = uuidSchema.parse((await params).replyId);
    const deleted = await db.delete(supportCannedReplies).where(eq(supportCannedReplies.id, replyId)).returning({ id: supportCannedReplies.id });
    if (!deleted.length) throw new AppError("NOT_FOUND", "Saved reply not found");
    await db.insert(auditLogs).values({ actorUserId: userId, action: "SUPPORT_CANNED_DELETED", entityType: "support_canned_reply", entityId: replyId, metadata: {} });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
