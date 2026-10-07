import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, sellerSettings, sellers } from "@azadimart/database";
import { AppError, sellerShippingSettingsSchema, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");

    const db = createDatabase();
    const seller = (await db.select({ id: sellers.id, status: sellers.status }).from(sellers)
      .where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

    const settings = (await db.select({ shippingSettings: sellerSettings.shippingSettings })
      .from(sellerSettings).where(eq(sellerSettings.sellerId, principal.sellerId)).limit(1))[0];

    return NextResponse.json({
      settings: settings?.shippingSettings ?? null,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PATCH(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) throw new AppError("FORBIDDEN", "Seller profile is required");

    const input = sellerShippingSettingsSchema.parse(await request.json());
    const db = createDatabase();

    const seller = (await db.select({ id: sellers.id, status: sellers.status }).from(sellers)
      .where(and(eq(sellers.id, principal.sellerId), eq(sellers.userId, principal.userId))).limit(1))[0];
    if (!seller || seller.status !== "ACTIVE") throw new AppError("FORBIDDEN", "Seller account is not active");

    const existing = (await db.select({ sellerId: sellerSettings.sellerId })
      .from(sellerSettings).where(eq(sellerSettings.sellerId, principal.sellerId)).limit(1))[0];

    if (existing) {
      await db.update(sellerSettings)
        .set({ shippingSettings: input, updatedAt: new Date() })
        .where(eq(sellerSettings.sellerId, principal.sellerId));
    } else {
      await db.insert(sellerSettings).values({
        sellerId: principal.sellerId,
        shippingSettings: input,
      });
    }

    return NextResponse.json({ ok: true, settings: input });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
