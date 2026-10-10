import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, customerAddresses } from "@azadimart/database";
import { addressSchema, AppError, toApiError } from "@azadimart/shared";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const db = createDatabase();
    const items = await db.select({
      id: customerAddresses.id, label: customerAddresses.label, line1: customerAddresses.line1,
      line2: customerAddresses.line2, city: customerAddresses.city, state: customerAddresses.state,
      postalCode: customerAddresses.postalCode, country: customerAddresses.country, isDefault: customerAddresses.isDefault,
    }).from(customerAddresses).where(eq(customerAddresses.customerId, session.customerId)).orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.updatedAt));
    return NextResponse.json({ items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const session = await requireApiAccess(request, "storefront", ["CUSTOMER"]);
    if (!session.customerId) throw new AppError("UNAUTHORIZED", "Customer profile required");
    const input = addressSchema.parse(await request.json());
    const db = createDatabase();
    const existing = await db.select({ id: customerAddresses.id }).from(customerAddresses).where(eq(customerAddresses.customerId, session.customerId)).limit(1);
    const makeDefault = input.isDefault || existing.length === 0;
    const item = (await db.transaction(async (tx) => {
      if (makeDefault) {
        await tx.update(customerAddresses).set({ isDefault: false, updatedAt: new Date() }).where(eq(customerAddresses.customerId, session.customerId!));
      }
      return (await tx.insert(customerAddresses).values({
        customerId: session.customerId!,
        label: input.label ?? null,
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: "IN",
        isDefault: makeDefault,
      }).returning())[0];
    }));
    if (!item) throw new AppError("INTERNAL", "Address creation failed", undefined, false);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
