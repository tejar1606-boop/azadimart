import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, carts, createDatabase } from "@azadimart/database";
import { AppError, cartReminderSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Records that an admin sent a cart reminder (used to measure recovered orders). */
export async function POST(request: Request, { params }: { params: Promise<{ cartId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { cartId } = await params;
    if (!uuidSchema.safeParse(cartId).success) throw new AppError("NOT_FOUND", "Cart not found");
    const input = cartReminderSchema.parse(await request.json());
    const db = createDatabase();
    const cart = (await db.update(carts).set({ lastReminderAt: new Date(), reminderCount: sql`${carts.reminderCount} + 1` })
      .where(eq(carts.id, cartId)).returning({ id: carts.id, reminderCount: carts.reminderCount }))[0];
    if (!cart) throw new AppError("NOT_FOUND", "Cart not found");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "CART_REMINDER_SENT", entityType: "cart", entityId: cartId, metadata: { channel: input.channel, couponCode: input.couponCode ?? null } });
    return NextResponse.json({ ok: true, reminderCount: cart.reminderCount });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
