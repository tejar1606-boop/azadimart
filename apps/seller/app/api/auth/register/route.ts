import { hashPassword } from "@azadimart/auth";
import {
  createDatabase,
  sellerSettings,
  sellerVerifications,
  sellers,
  users,
} from "@azadimart/database";
import { AppError, sellerRegistrationSchema, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const input = sellerRegistrationSchema.parse(await request.json());
    const db = createDatabase();

    const existing = await db
      .select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(and(eq(users.email, input.email.toLowerCase()), eq(users.phone, input.phone)))
      .limit(1);

    if (existing[0]) {
      throw new AppError("CONFLICT", "An account already exists with this email or phone");
    }

    const existingEmail = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (existingEmail[0]) {
      throw new AppError("CONFLICT", "An account already exists with this email");
    }

    const existingPhone = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, input.phone))
      .limit(1);

    if (existingPhone[0]) {
      throw new AppError("CONFLICT", "An account already exists with this phone number");
    }

    const passwordHash = await hashPassword(input.password);

    const insertedUsers = await db
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        phone: input.phone,
        passwordHash,
        role: "SELLER",
        status: "ACTIVE",
      })
      .returning({ id: users.id });

    const user = insertedUsers[0];
    if (!user) {
      throw new AppError("INTERNAL", "Seller account creation failed", undefined, false);
    }

    try {
      const insertedSellers = await db
        .insert(sellers)
        .values({
          userId: user.id,
          storeName: input.storeName,
          legalName: input.legalName,
          taxIdentityType: input.taxIdentityType,
          gstin: input.gstin ?? null,
          gstEnrolmentId: input.gstEnrolmentId ?? null,
          businessState: input.businessState,
          taxDeclarationAcceptedAt: input.taxDeclarationAccepted ? new Date() : null,
          status: "REGISTERED",
        })
        .returning({ id: sellers.id });

      const seller = insertedSellers[0];
      if (!seller) {
        throw new AppError("INTERNAL", "Seller profile creation failed", undefined, false);
      }

      try {
        await db.insert(sellerSettings).values({ sellerId: seller.id });
        await db.insert(sellerVerifications).values({
          sellerId: seller.id,
          status: "PENDING",
        });

        return NextResponse.json(
          {
            ok: true,
            sellerId: seller.id,
            status: "REGISTERED",
            message: "Seller account created. Complete KYC before admin approval.",
          },
          { status: 201 },
        );
      } catch (error) {
        await db.delete(sellers).where(eq(sellers.id, seller.id));
        throw error;
      }
    } catch (error) {
      await db.delete(users).where(eq(users.id, user.id));
      if (isUniqueViolation(error)) {
        throw new AppError("CONFLICT", "An account already exists with this email or phone");
      }
      throw error;
    }
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
