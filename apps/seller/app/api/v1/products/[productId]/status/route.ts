import { auditLogs, products, qcSubmissions } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireOwnedProduct } from "../aplus/shared";

type Action = "unlist" | "relist" | "withdraw" | "archive" | "restore";
type Status = typeof products.$inferSelect.status;

/** Allowed seller transitions: from-statuses and the resulting status. */
const ACTIONS: Record<Action, { from: Status[]; to: Status; audit: string }> = {
  // Hide a live product from the storefront (orders and history stay intact).
  unlist: { from: ["LIVE"], to: "UNLISTED", audit: "PRODUCT_UNLISTED" },
  // Put an unlisted product back; it was already approved and sellers cannot edit approved content.
  relist: { from: ["UNLISTED"], to: "LIVE", audit: "PRODUCT_RELISTED" },
  // Pull a product out of review back to an editable draft.
  withdraw: { from: ["PENDING_QC", "PENDING_ADMIN_APPROVAL"], to: "DRAFT", audit: "PRODUCT_WITHDRAWN" },
  // "Remove": archived products are hidden everywhere but kept for orders and invoices.
  archive: { from: ["DRAFT", "PENDING_QC", "QC_REJECTED", "PENDING_ADMIN_APPROVAL", "LIVE", "UNLISTED"], to: "ARCHIVED", audit: "PRODUCT_ARCHIVED" },
  // Restored products start again as drafts and need QC to go live.
  restore: { from: ["ARCHIVED"], to: "DRAFT", audit: "PRODUCT_RESTORED" },
};

export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const { productId } = await params;
    const { db, principal, product } = await requireOwnedProduct(request, productId);
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    const action = body.action as Action;
    const rule = ACTIONS[action];
    if (!rule) throw new AppError("VALIDATION_ERROR", "Unknown action");
    if (!rule.from.includes(product.status as Status)) {
      throw new AppError("CONFLICT", `This product is ${product.status.replaceAll("_", " ").toLowerCase()} and can't be changed that way`);
    }

    const result = await db.transaction(async (tx) => {
      const updated = (await tx.update(products).set({ status: rule.to, updatedAt: new Date() })
        .where(and(eq(products.id, product.id), eq(products.status, product.status as Status)))
        .returning({ id: products.id, status: products.status }))[0];
      if (!updated) throw new AppError("CONFLICT", "The product changed; please refresh and try again");
      // Withdrawing or removing closes any open QC submission so it leaves the review queue.
      if (action === "withdraw" || action === "archive") {
        await tx.update(qcSubmissions).set({ status: "REJECTED", notes: "Withdrawn by seller", updatedAt: new Date() })
          .where(and(eq(qcSubmissions.productId, product.id), eq(qcSubmissions.status, "PENDING")));
      }
      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: rule.audit,
        entityType: "product",
        entityId: product.id,
        metadata: { from: product.status, to: rule.to },
      });
      return updated;
    });

    return NextResponse.json({ ok: true, product: result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
