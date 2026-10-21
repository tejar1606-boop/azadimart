import { requireStaff } from "@azadimart/auth";
import { createDatabase, importReviewBatch } from "@azadimart/database";
import { bulkReviewImportSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Admin bulk import of genuine reviews from a CSV (any seller's SKUs); they go live at once. dryRun: check only. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "catalog");
    const input = bulkReviewImportSchema.parse(await request.json());
    const result = await importReviewBatch(createDatabase(), { ...input, addedByUserId: principal.userId, sellerId: null, status: "PUBLISHED" });
    return NextResponse.json(result, { status: result.ok ? (input.dryRun ? 200 : 201) : 422 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
