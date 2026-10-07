import { hashPassword } from "@azadimart/auth";
import { createDatabase, customers, users } from "@azadimart/database";
import { AppError, customerRegistrationSchema, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const input = customerRegistrationSchema.parse(await request.json());
    const db = createDatabase();

    const [existingEmail, existingPhone] = await Promise.all([
      db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1),
      db.select({ id: users.id }).from(users).where(eq(users.phone, input.phone)).limit(1),
    ]);

    if (existingEmail[0]) throw new AppError("CONFLICT", "An account already exists with this email.");
    if (existingPhone[0]) throw new AppError("CONFLICT", "An account already exists with this phone number.");

    const passwordHash = await hashPassword(input.password);
    const insertedUsers = await db.insert(users).values({
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: "CUSTOMER",
      status: "ACTIVE",
    }).returning({ id: users.id });

    const user = insertedUsers[0];
    if (!user) throw new AppError("INTERNAL", "Account creation failed", undefined, false);

    try {
      const insertedCustomers = await db.insert(customers).values({
        userId: user.id,
        fullName: input.fullName,
      }).returning({ id: customers.id });
      const customer = insertedCustomers[0];
      if (!customer) throw new AppError("INTERNAL", "Customer profile creation failed", undefined, false);
      return NextResponse.json({ ok: true, customerId: customer.id }, { status: 201 });
    } catch (error) {
      await db.delete(users).where(eq(users.id, user.id));
      throw error;
    }
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
