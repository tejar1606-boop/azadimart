import { DEFAULT_PLATFORM_FEE, PLATFORM_FEE_KEY, type PlatformFeeSettings } from "@azadimart/shared";
import type { createDatabase } from "./client";
import { getPlatformSetting } from "./platform-settings";

/** Current platform fee rules (Admin → Finance), falling back to the default ₹8 per order. */
export async function platformFeeSettings(db: Pick<ReturnType<typeof createDatabase>, "select">): Promise<PlatformFeeSettings> {
  return { ...DEFAULT_PLATFORM_FEE, ...((await getPlatformSetting<Partial<PlatformFeeSettings>>(db, PLATFORM_FEE_KEY)) ?? {}) };
}
