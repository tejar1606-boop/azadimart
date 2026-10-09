import { requireApiAccess } from "@azadimart/auth";
import { adSlots, auditLogs, createDatabase } from "@azadimart/database";
import { AppError, adSlotSchema, toApiError, uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/** Change an ad space's prices or rules. Bids already placed keep their amounts. */
export async function PATCH(request: Request, { params }: { params: Promise<{ slotId: string }> }) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { slotId } = await params;
    if (!uuidSchema.safeParse(slotId).success) throw new AppError("NOT_FOUND", "Ad space not found");
    const input = adSlotSchema.parse(await request.json());
    const db = createDatabase();
    const [slot] = await db.update(adSlots).set({ ...input, buyNowPricePaise: input.buyNowPricePaise ?? null, updatedAt: new Date() }).where(eq(adSlots.id, slotId)).returning();
    if (!slot) throw new AppError("NOT_FOUND", "Ad space not found");
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "AD_SLOT_UPDATED", entityType: "ad_slot", entityId: slotId, metadata: input });
    return NextResponse.json({ slot });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
