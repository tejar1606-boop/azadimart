import { categories, createDatabase, pageBanners } from "@azadimart/database";
import { PAGE_BANNER_DESKTOP, PAGE_BANNER_MOBILE, pageBannerLive } from "@azadimart/shared";
import { eq, inArray } from "drizzle-orm";
import Link from "next/link";

/**
 * The banner set in Admin → Page banners for this page. A category page uses
 * its own banner, else its parent category's. Shows nothing when there's no
 * live banner (switched off, not started, or ended).
 */
export default async function PageBanner({ pageKey, categoryId, className = "" }: { pageKey?: string; categoryId?: string; className?: string }) {
  let banner: typeof pageBanners.$inferSelect | undefined;
  try {
    const db = createDatabase();
    const keys = pageKey ? [pageKey] : [];
    if (categoryId) {
      keys.push(`category:${categoryId}`);
      const parent = (await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, categoryId)).limit(1))[0]?.parentId;
      if (parent) keys.push(`category:${parent}`);
    }
    if (!keys.length) return null;
    const rows = await db.select().from(pageBanners).where(inArray(pageBanners.pageKey, keys));
    banner = keys.map((k) => rows.find((r) => r.pageKey === k)).find((r) => r && pageBannerLive(r));
  } catch {
    return null; // a banner must never break the page
  }
  if (!banner) return null;

  const mobile = banner.mobileImageUrl;
  // Reserve the exact shape so the page doesn't jump while the image loads.
  const frame = mobile ? "aspect-[800/329] sm:aspect-[1800/320]" : "aspect-[1800/320]";
  const art = (
    <picture className={"block overflow-hidden bg-slate-200 " + frame}>
      {mobile ? <source media="(max-width: 639px)" srcSet={mobile} width={PAGE_BANNER_MOBILE.width} height={PAGE_BANNER_MOBILE.height} /> : null}
      <img src={banner.desktopImageUrl} alt={banner.alt} width={PAGE_BANNER_DESKTOP.width} height={PAGE_BANNER_DESKTOP.height} className="h-full w-full object-cover" fetchPriority="high" />
    </picture>
  );
  const href = banner.href && (/^\/(?![/\\])/.test(banner.href) || /^https:\/\//i.test(banner.href)) ? banner.href : null;
  return (
    // Full width, edge to edge and square, directly under the menu.
    <div className={className}>
      {href ? (href.startsWith("/") ? <Link href={href} aria-label={banner.alt || "Banner"} className="block">{art}</Link> : <a href={href} aria-label={banner.alt || "Banner"} className="block" rel="noopener">{art}</a>) : art}
    </div>
  );
}
