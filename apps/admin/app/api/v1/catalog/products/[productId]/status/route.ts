import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, products, qcSubmissions } from "@azadimart/database";
import { AppError, adminProductStatusSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type Status = typeof products.$inferSelect.status;
const RULES: Record<"hide" | "show" | "archive" | "restore", { from: Status[]; to: Status; audit: string }> = {
  hide: { from: ["LIVE"], to: "UNLISTED", audit: "PRODUCT_UNLISTED_BY_ADMIN" },
  show: { from: ["UNLISTED"], to: "LIVE", audit: "PRODUCT_RELISTED_BY_ADMIN" },
  archive: { from: ["DRAFT", "PENDING_QC", "QC_REJECTED", "PENDING_ADMIN_APPROVAL", "LIVE", "UNLISTED"], to: "ARCHIVED", audit: "PRODUCT_ARCHIVED_BY_ADMIN" },
  restore: { from: ["ARCHIVED"], to: "UNLISTED", audit: "PRODUCT_RESTORED_BY_ADMIN" },
};

/** Admin visibility controls: hide/show on the store, archive (soft delete) and restore. */
export async function POST(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { productId } = await params;
    if (!uuidSchema.safeParse(productId).success) throw new AppError("NOT_FOUND", "Product not found");
    const input = adminProductStatusSchema.parse(await request.json());
    const rule = RULES[input.action];
    const db = createDatabase();
    const product = await db.transaction(async (tx) => {
      const current = (await tx.select({ status: products.status }).from(products).where(eq(products.id, productId)).limit(1).for("update"))[0];
      if (!current) throw new AppError("NOT_FOUND", "Product not found");
      if (!rule.from.includes(current.status)) throw new AppError("CONFLICT", `Not possible while the product is ${current.status.replaceAll("_", " ").toLowerCase()}`);
      const updated = (await tx.update(products).set({ status: rule.to, updatedAt: new Date() }).where(eq(products.id, productId)).returning({ id: products.id, status: products.status }))[0];
      if (input.action === "archive") {
        await tx.update(qcSubmissions).set({ status: "REJECTED", notes: "Archived by AzadiMart", updatedAt: new Date() })
          .where(and(eq(qcSubmissions.productId, productId), eq(qcSubmissions.status, "PENDING")));
      }
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: rule.audit, entityType: "product", entityId: productId, metadata: { from: current.status, to: rule.to, reason: input.reason ?? null } });
      return updated;
    });
    return NextResponse.json({ ok: true, product });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
