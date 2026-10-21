import { eq } from "drizzle-orm";
import type { createDatabase } from "./client";
import { auditLogs, platformSettings } from "./schema/index";

type Db = ReturnType<typeof createDatabase>;

/** A store-wide setting edited in Admin, or null when it was never set. */
export async function getPlatformSetting<T>(db: Db, key: string): Promise<T | null> {
  const row = (await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, key)).limit(1))[0];
  return (row?.value as T | undefined) ?? null;
}

/** Saves a store-wide setting and records who changed it. */
export async function setPlatformSetting(db: Db, key: string, value: unknown, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(platformSettings).values({ key, value, updatedByUserId: userId, updatedAt: new Date() })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedByUserId: userId, updatedAt: new Date() } });
    await tx.insert(auditLogs).values({ actorUserId: userId, action: "PLATFORM_SETTING_SAVED", entityType: "platform_setting", entityId: key, metadata: { key } });
  });
}
