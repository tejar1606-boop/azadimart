import { requireStaff } from "@azadimart/auth";
import { createDatabase, decideReviewBatch } from "@azadimart/database";
import { bulkReviewDecisionSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Approve or reject every waiting review from one seller upload. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "catalog");
    const input = bulkReviewDecisionSchema.parse(await request.json());
    const count = await decideReviewBatch(createDatabase(), { ...input, adminUserId: principal.userId });
    return NextResponse.json({ ok: true, count });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
