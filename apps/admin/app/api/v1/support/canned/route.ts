import { auditLogs, supportCannedReplies } from "@azadimart/database";
import { supportCannedReplySchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";
import { requireSupportStaff } from "../staff";

export const dynamic = "force-dynamic";

/** Saved replies for the support team. */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db } = await requireSupportStaff(request);
    return NextResponse.json({ items: await db.select().from(supportCannedReplies).orderBy(supportCannedReplies.title) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const { db, userId } = await requireSupportStaff(request);
    const input = supportCannedReplySchema.parse(await request.json());
    const [reply] = await db.insert(supportCannedReplies).values({ ...input, createdByUserId: userId }).returning();
    await db.insert(auditLogs).values({ actorUserId: userId, action: "SUPPORT_CANNED_CREATED", entityType: "support_canned_reply", entityId: reply!.id, metadata: { title: input.title } });
    return NextResponse.json({ reply }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
