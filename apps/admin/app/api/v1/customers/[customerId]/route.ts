import { requireStaff } from "@azadimart/auth";
import { auditLogs, createDatabase, customers, deleteCustomerProfile, sessions, users } from "@azadimart/database";
import { AppError, toApiError, uuidSchema } from "@azadimart/shared";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Block a shopper (signs them out everywhere; they can't sign in or order) or unblock them. A reason is kept in the audit log. */
export async function PATCH(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "orders");
    const { customerId } = await params;
    if (!uuidSchema.safeParse(customerId).success) throw new AppError("NOT_FOUND", "Customer not found");
    const { blocked, reason } = (await request.json().catch(() => ({}))) as { blocked?: boolean; reason?: string };
    if (typeof blocked !== "boolean") throw new AppError("VALIDATION_ERROR", "Say whether to block or unblock");
    const note = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
    if (blocked && note.length < 3) throw new AppError("VALIDATION_ERROR", "Give a reason for blocking this customer");
    const db = createDatabase();
    const [customer] = await db.select({ userId: customers.userId }).from(customers).where(eq(customers.id, customerId)).limit(1);
    if (!customer) throw new AppError("NOT_FOUND", "Customer not found");
    await db.transaction(async (tx) => {
      await tx.update(users).set({ status: blocked ? "DISABLED" : "ACTIVE", updatedAt: new Date() }).where(and(eq(users.id, customer.userId), eq(users.role, "CUSTOMER")));
      if (blocked) await tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, customer.userId), isNull(sessions.revokedAt)));
      await tx.insert(auditLogs).values({ actorUserId: principal.userId, action: blocked ? "CUSTOMER_BLOCKED" : "CUSTOMER_UNBLOCKED", entityType: "customer", entityId: customerId, metadata: { reason: note || null } });
    });
    return NextResponse.json({ ok: true, status: blocked ? "DISABLED" : "ACTIVE" });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/**
 * Delete a shopper's profile (type DELETE to confirm, with a reason). Owner and full admins only.
 * Removed for good if they never ordered; otherwise anonymised, since orders and invoices must be kept.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ customerId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireStaff(request, "orders");
    if (!principal.permissions.includes("team")) throw new AppError("FORBIDDEN", "Only the owner or a full admin can delete a customer profile");
    const { customerId } = await params;
    if (!uuidSchema.safeParse(customerId).success) throw new AppError("NOT_FOUND", "Customer not found");
    const { confirm, reason } = (await request.json().catch(() => ({}))) as { confirm?: string; reason?: string };
    if (confirm !== "DELETE") throw new AppError("VALIDATION_ERROR", "Type DELETE to confirm");
    const note = typeof reason === "string" ? reason.trim().slice(0, 300) : "";
    if (note.length < 3) throw new AppError("VALIDATION_ERROR", "Give a reason for deleting this profile");
    const db = createDatabase();
    const result = await deleteCustomerProfile(db, customerId);
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "CUSTOMER_DELETED", entityType: "customer", entityId: customerId, metadata: { reason: note, mode: result.mode, orders: result.orders } });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
