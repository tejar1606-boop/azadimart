import { z } from "zod";

/**
 * Platform fee: a small fixed amount added once to every shopper order (like
 * the big marketplaces) for running LOIMART: operations, customer support,
 * secure payments and keeping the site and apps working. LOIMART keeps it;
 * sellers' payouts don't change. Admin → Finance sets it.
 * GST treatment (LOIMART's own service) must be confirmed with the CA.
 */
export type PlatformFeeSettings = { enabled: boolean; feePaise: number };
export const PLATFORM_FEE_KEY = "customer_platform_fee";
export const DEFAULT_PLATFORM_FEE: PlatformFeeSettings = { enabled: true, feePaise: 800 };
export const platformFeeSettingsSchema = z.object({ enabled: z.boolean(), feePaise: z.number().int().min(0).max(100_00) });

/** The fee on one order (0 when switched off). */
export const platformFeeFor = (s: PlatformFeeSettings) => (s.enabled ? Math.max(0, s.feePaise) : 0);

/** What shoppers are told when they tap the fee. */
export const PLATFORM_FEE_EXPLAINER = "A small fee charged once per order, however many items you buy. It helps LOIMART run the platform: operations, customer support, secure payments, and keeping the website and app working smoothly. Sellers get their full price.";
