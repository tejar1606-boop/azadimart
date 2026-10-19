import { categories, createDatabase, navigation, navigationItems, themes } from "@azadimart/database";
import { and, asc, eq } from "drizzle-orm";

export type ChromeLink = { label: string; href: string };
/** Festival intro animation shown full screen when a shopper opens the store (set in Admin → Online Store). */
export type StoreIntro = {
  id: string;
  name: string;
  kind: "video" | "image";
  desktopUrl: string;
  mobileUrl: string;
  background: string;
  seconds: number;
  frequency: "once" | "daily" | "visit";
  href: string | null;
};
export type StoreChrome = {
  intro: StoreIntro | null;
  announcements: string[];
  navigation: ChromeLink[];
  /** Main categories in admin order; children = their active sub-categories (for the phone menu). */
  categories: Array<{ id: string; name: string; href: string; children: Array<{ id: string; name: string; href: string }> }>;
};

const SELLER_URL = process.env.NEXT_PUBLIC_SELLER_URL || "https://seller.loimart.com";
/** Admin menu links may point at /seller; the seller portal is a separate host. */
export const resolveStoreHref = (href: string) => (href === "/seller" || href.startsWith("/seller/") ? SELLER_URL + href.slice("/seller".length) : href);

const DEFAULT_ANNOUNCEMENTS = ["Cash on Delivery available across India", "Shop from verified Indian sellers", "Easy 7-day returns"];

const safeMedia = (v: unknown) => (typeof v === "string" && (/^\/media\/[\w\-./]+$/.test(v.trim()) || /^https:\/\/[^\s"'<>]+$/i.test(v.trim())) ? v.trim() : "");
const safeLink = (v: unknown) => (typeof v === "string" && /^\/(?![/\\])/.test(v.trim()) ? v.trim() : null);

/** The intro animation, only when switched on, uploaded and inside its dates (India time). */
export function readIntro(settings: Record<string, unknown> | undefined, now = new Date()): StoreIntro | null {
  const raw = settings?.intro;
  if (!raw || typeof raw !== "object") return null;
  const i = raw as Record<string, unknown>;
  if (i.enabled !== true) return null;
  const desktopUrl = safeMedia(i.desktopUrl) || safeMedia(i.mobileUrl);
  const mobileUrl = safeMedia(i.mobileUrl) || desktopUrl;
  if (!desktopUrl) return null;
  // Dates are whole days in India time: "from" starts at 00:00 IST, "until" ends at 23:59 IST.
  const day = (v: unknown, end: boolean) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T${end ? "23:59:59" : "00:00:00"}+05:30`) : null);
  const from = day(i.startsOn, false), until = day(i.endsOn, true);
  if ((from && now < from) || (until && now > until)) return null;
  const seconds = typeof i.seconds === "number" && Number.isFinite(i.seconds) ? Math.min(10, Math.max(2, Math.round(i.seconds))) : 4;
  const background = typeof i.background === "string" && /^#[0-9a-f]{6}$/i.test(i.background) ? i.background : "#ffffff";
  const frequency = i.frequency === "daily" || i.frequency === "visit" ? i.frequency : "once";
  // A new upload or date range counts as a new intro, so shoppers see it again.
  const id = [desktopUrl, mobileUrl, i.startsOn ?? "", i.endsOn ?? ""].join("|");
  return { id, name: typeof i.name === "string" ? i.name.slice(0, 60) : "", kind: i.kind === "image" ? "image" : "video", desktopUrl, mobileUrl, background, seconds, frequency, href: safeLink(i.href) };
}

/** Header/footer data shared by every storefront page. Never throws: chrome must render even if the DB is unavailable. */
export async function getStoreChrome(): Promise<StoreChrome> {
  try {
    const db = createDatabase();
    const [theme, categoryRows] = await Promise.all([
      db.select({ id: themes.id, settings: themes.settings }).from(themes).where(eq(themes.status, "PUBLISHED")).limit(1).then((rows) => rows[0]),
      db.select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId })
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.sortOrder), asc(categories.name)),
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

    const link = (category: { id: string; name: string; slug: string }) => ({ id: category.id, name: category.name, href: "/c/" + category.slug });
    const categoryLinks = categoryRows.filter((category) => !category.parentId).slice(0, 12)
      .map((category) => ({ ...link(category), children: categoryRows.filter((child) => child.parentId === category.id).map(link) }));
    return {
      intro: readIntro(theme?.settings as Record<string, unknown> | undefined),
      announcements: announcements.length ? announcements : DEFAULT_ANNOUNCEMENTS,
      navigation: navLinks.length ? navLinks : categoryLinks.slice(0, 8).map((category) => ({ label: category.name, href: category.href })),
      categories: categoryLinks,
    };
  } catch {
    return { intro: null, announcements: DEFAULT_ANNOUNCEMENTS, navigation: [], categories: [] };
  }
}
