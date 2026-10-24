import { enforceRateLimit, requireApiAccess } from "@azadimart/auth";
import { createDatabase, importReviewBatch } from "@azadimart/database";
import { AppError, bulkReviewImportSchema, toApiError } from "@azadimart/shared";
import { NextResponse } from "next/server";

/** Seller bulk import of genuine reviews for their own SKUs; they wait for an admin to check the proof. dryRun: check only. */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");
    const input = bulkReviewImportSchema.parse(await request.json());
    const db = createDatabase();
    if (!input.dryRun) await enforceRateLimit(db, request, "reviewImport", { subject: principal.userId });
    const result = await importReviewBatch(db, { ...input, addedByUserId: principal.userId, sellerId: principal.sellerId, status: "PENDING" });
    return NextResponse.json(result, { status: result.ok ? (input.dryRun ? 200 : 201) : 422 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
