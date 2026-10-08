import { categories, createDatabase, navigation, navigationItems, themes } from "@azadimart/database";
import { and, asc, eq, isNull } from "drizzle-orm";

export type ChromeLink = { label: string; href: string };
export type StoreChrome = {
  announcements: string[];
  navigation: ChromeLink[];
  categories: Array<{ id: string; name: string; href: string }>;
};

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.azadimart.com";
/** Admin menu links may point at /seller; the seller portal is a separate host. */
export const resolveStoreHref = (href: string) => (href === "/seller" || href.startsWith("/seller/") ? SELLER_URL + href.slice("/seller".length) : href);

const DEFAULT_ANNOUNCEMENTS = ["Cash on Delivery available across India", "Shop from verified Indian sellers", "Easy 7-day returns"];

/** Header/footer data shared by every storefront page. Never throws: chrome must render even if the DB is unavailable. */
export async function getStoreChrome(): Promise<StoreChrome> {
  try {
    const db = createDatabase();
    const [theme, categoryRows] = await Promise.all([
      db.select({ id: themes.id, settings: themes.settings }).from(themes).where(eq(themes.status, "PUBLISHED")).limit(1).then((rows) => rows[0]),
      db.select({ id: categories.id, name: categories.name, slug: categories.slug })
        .from(categories)
        .where(and(eq(categories.isActive, true), isNull(categories.parentId)))
        .orderBy(asc(categories.sortOrder), asc(categories.name))
        .limit(12),
    ]);

    let navLinks: ChromeLink[] = [];
    if (theme) {
      const nav = (await db.select({ id: navigation.id }).from(navigation)
        .where(and(eq(navigation.themeId, theme.id), eq(navigation.handle, "main-menu"))).limit(1))[0];
      if (nav) {
        navLinks = (await db.select({ label: navigationItems.label, href: navigationItems.href, isActive: navigationItems.isActive })
          .from(navigationItems).where(eq(navigationItems.navigationId, nav.id)).orderBy(asc(navigationItems.position)))
          .filter((item) => item.isActive && item.href)
          .map((item) => ({ label: item.label, href: resolveStoreHref(item.href!) }));
      }
    }

    const announcement = typeof (theme?.settings as Record<string, unknown> | undefined)?.announcement === "string"
      ? String((theme!.settings as Record<string, unknown>).announcement)
      : "";
    const announcements = announcement.split(/[|•]/).map((part) => part.trim()).filter(Boolean);

    const categoryLinks = categoryRows.map((category) => ({ id: category.id, name: category.name, href: "/c/" + category.slug }));
    return {
      announcements: announcements.length ? announcements : DEFAULT_ANNOUNCEMENTS,
      navigation: navLinks.length ? navLinks : categoryLinks.slice(0, 8).map((category) => ({ label: category.name, href: category.href })),
      categories: categoryLinks,
    };
  } catch {
    return { announcements: DEFAULT_ANNOUNCEMENTS, navigation: [], categories: [] };
  }
}
