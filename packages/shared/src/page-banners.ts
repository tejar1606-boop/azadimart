import { z } from "zod";

/** Page banner sizes (admin enforces the shape; bigger files at the same shape are fine). */
export const PAGE_BANNER_DESKTOP = { width: 1800, height: 320 } as const;
export const PAGE_BANNER_MOBILE = { width: 800, height: 329 } as const;

/** Pages that can have a banner. Categories use "category:<id>". */
export const PAGE_BANNER_PAGES = [
  { key: "shop", label: "Shop (All products & search results)", path: "/products" },
  { key: "product", label: "Product pages (all products)", path: "/products/…" },
  { key: "cart", label: "Cart", path: "/cart" },
  { key: "wishlist", label: "Wishlist", path: "/wishlist" },
  { key: "account", label: "My account & orders", path: "/account" },
] as const;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const pageBannerKeyPattern = new RegExp(`^(shop|product|cart|wishlist|account|category:${UUID})$`, "i");

// Images: uploaded media (/media/…) or https. Links: on-site paths or https.
const imageUrl = z.string().trim().max(1000).refine((v) => /^\/media\/[\w./-]+$/.test(v) || /^https:\/\/[^\s]+$/i.test(v), "Upload the image or use an https link");
const link = z.string().trim().max(500).refine((v) => /^\/(?![/\\])[^\s]*$/.test(v) || /^https:\/\/[^\s]+$/i.test(v), "Use a page on the store (like /c/fashion) or an https link");

export const pageBannerSchema = z.object({
  pageKey: z.string().regex(pageBannerKeyPattern, "Unknown page"),
  desktopImageUrl: imageUrl,
  mobileImageUrl: imageUrl.nullable().optional().default(null),
  href: link.nullable().optional().default(null),
  alt: z.string().trim().max(160).optional().default(""),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
  endsAt: z.string().datetime({ offset: true }).nullable().optional().default(null),
}).refine((b) => !b.startsAt || !b.endsAt || new Date(b.endsAt) > new Date(b.startsAt), { message: "End must be after the start", path: ["endsAt"] });

/** Whether a banner should show right now. */
export function pageBannerLive(b: { isActive: boolean; startsAt: Date | string | null; endsAt: Date | string | null }, now = new Date()) {
  if (!b.isActive) return false;
  if (b.startsAt && new Date(b.startsAt) > now) return false;
  if (b.endsAt && new Date(b.endsAt) <= now) return false;
  return true;
}
