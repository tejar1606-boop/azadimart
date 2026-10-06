import { eq } from "drizzle-orm";
import { createDatabase, users, type Database } from "@azadimart/database";
import { AppError, type Role } from "@azadimart/shared";
import { createSession, verifyPassword } from "./session";

export async function loginUser(
  db: Database,
  email: string,
  password: string,
  allowedRoles: Role[],
): Promise<{ token: string; userId: string; role: Role }> {
  const rows = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  const user = rows[0];
  const valid = Boolean(user?.passwordHash) && await verifyPassword(password, user.passwordHash ?? "");
  if (!user || !valid || user.status !== "ACTIVE" || !allowedRoles.includes(user.role as Role)) {
    throw new AppError("UNAUTHORIZED", "Invalid email or password");
  }

  const token = await createSession(db, user.id);
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));

  return { token, userId: user.id, role: user.role as Role };
}

export async function loginWithDatabase(
  email: string,
  password: string,
  allowedRoles: Role[],
): Promise<{ token: string; userId: string; role: Role }> {
  return loginUser(createDatabase(), email, password, allowedRoles);
}
