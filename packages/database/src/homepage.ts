import { AppError, DEFAULT_HOME_SECTIONS } from "@azadimart/shared";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { auditLogs, pageSections, pages, themeRevisions, themes } from "./schema/index";

/**
 * The store home page: shared by the Admin "Online Store" editor (layout) and
 * the Banner Studio (banners). Drafts live only in theme_revisions;
 * page_sections and the theme/page status are the published homepage and
 * change only on publish.
 */
export type DraftSnapshot = {
  kind: "draft";
  themeSettings: Record<string, unknown>;
  sections: Array<{ type: string; isVisible: boolean; settings: Record<string, unknown> }>;
};

// "AzadiMart Core" is the stored theme key, not shown to shoppers. Never rename it with the brand.
const THEME_KEY = "AzadiMart Core";
const lock = sql`select pg_advisory_xact_lock(hashtext('azadimart:theme_publish'))`;

/** Sections whose content is owned by the Banner Studio (Admin only adds, moves and hides them). */
export const STUDIO_SECTION_TYPES = ["hero", "promo_banner", "banner_row"] as const;
const isStudioType = (type: string) => (STUDIO_SECTION_TYPES as readonly string[]).includes(type);
type SnapshotSection = DraftSnapshot["sections"][number];
/** Gives each banner section a permanent key so its content can be matched across saves. */
const withKey = (s: SnapshotSection): SnapshotSection =>
  isStudioType(s.type) && typeof s.settings.sectionKey !== "string" ? { ...s, settings: { ...s.settings, sectionKey: crypto.randomUUID() } } : s;

/**
 * An Admin layout save keeps the banner content already saved (by the Banner
 * Studio), so an editor left open never brings back old banners. Sections are
 * matched by key, else by their order among sections of the same type.
 */
export function keepSavedBanners(incoming: SnapshotSection[], saved: SnapshotSection[]): SnapshotSection[] {
  const byKey = new Map(saved.filter((s) => typeof s.settings.sectionKey === "string").map((s) => [s.settings.sectionKey as string, s]));
  const used = new Set<SnapshotSection>();
  return incoming.map((section) => {
    if (!isStudioType(section.type)) return section;
    const key = section.settings.sectionKey;
    let match = typeof key === "string" ? byKey.get(key) : undefined;
    if (!match && typeof key !== "string") {
      // Only sections from before keys existed are matched by order; a new section never borrows another's banners.
      const nth = incoming.filter((s) => s.type === section.type && typeof s.settings.sectionKey !== "string").indexOf(section);
      match = saved.filter((s) => s.type === section.type && typeof s.settings.sectionKey !== "string")[nth];
    }
    if (!match || match.type !== section.type || used.has(match)) return section;
    used.add(match);
    return { ...section, settings: match.settings };
  });
}

async function currentSections(tx: Pick<Database, "select">, themeId: string, pageId: string): Promise<SnapshotSection[]> {
  const draft = await getPendingDraft(tx, themeId);
  if (draft) return draft.sections;
  return (await tx.select().from(pageSections).where(eq(pageSections.pageId, pageId)).orderBy(asc(pageSections.position)))
    .map((s) => ({ type: s.type as string, isVisible: s.isVisible, settings: (s.settings ?? {}) as Record<string, unknown> }));
}

/** The pending draft is the newest revision when it is a draft (a publish revision supersedes it). */
export async function getPendingDraft(db: Pick<Database, "select">, themeId: string): Promise<DraftSnapshot | null> {
  const latest = (await db.select({ snapshot: themeRevisions.snapshot }).from(themeRevisions)
    .where(eq(themeRevisions.themeId, themeId))
    .orderBy(desc(themeRevisions.createdAt))
    .limit(1))[0];
  const snapshot = latest?.snapshot as Partial<DraftSnapshot> | undefined;
  return snapshot?.kind === "draft" && Array.isArray(snapshot.sections) ? (snapshot as DraftSnapshot) : null;
}

/** The home theme, page and published sections, created with defaults on first use. */
export async function ensureHomepage(db: Database) {
  // Serialize first-run initialization with draft saves and publishing, so two
  // requests never both create the default theme/page.
  await db.transaction(async (tx) => {
    await tx.execute(lock);
    let theme = (await tx.select().from(themes).where(eq(themes.name, THEME_KEY)).limit(1))[0];
    if (!theme) {
      const created = (await tx.insert(themes).values({ name: THEME_KEY, status: "DRAFT", settings: { mode: "premium-india", surface: "light" } }).returning())[0];
      if (!created) throw new AppError("INTERNAL", "Theme creation failed", undefined, false);
      theme = created;
    }
    const page = (await tx.select().from(pages).where(eq(pages.themeId, theme.id)).limit(1))[0];
    if (!page) {
      const created = (await tx.insert(pages).values({ themeId: theme.id, slug: "home", title: "Homepage", status: "DRAFT" }).returning())[0];
      if (!created) throw new AppError("INTERNAL", "Homepage creation failed", undefined, false);
      await tx.insert(pageSections).values(DEFAULT_HOME_SECTIONS.map((section) => ({
        pageId: created.id, type: section.type, position: section.position, isVisible: section.isVisible, settings: section.settings,
      })));
    }
  });

  const theme = (await db.select().from(themes).where(eq(themes.name, THEME_KEY)).limit(1))[0];
  if (!theme) throw new AppError("INTERNAL", "Homepage theme missing", undefined, false);
  const page = (await db.select().from(pages).where(eq(pages.themeId, theme.id)).limit(1))[0];
  if (!page) throw new AppError("INTERNAL", "Homepage missing", undefined, false);
  const sections = await db.select().from(pageSections).where(eq(pageSections.pageId, page.id)).orderBy(asc(pageSections.position));
  return { theme, page, sections };
}

/** What an editor works on: the pending draft if there is one, else the live homepage. */
export async function loadHomepageForEditing(db: Database) {
  const { theme, page, sections } = await ensureHomepage(db);
  const draft = await getPendingDraft(db, theme.id);
  return {
    theme, page,
    themeSettings: (draft?.themeSettings ?? theme.settings ?? {}) as Record<string, unknown>,
    sections: draft
      ? draft.sections.map((section, index) => ({ id: "draft-" + index, pageId: page.id, position: index, ...section }))
      : sections.map((s) => ({ ...s, settings: (s.settings ?? {}) as Record<string, unknown> })),
    hasUnpublishedChanges: Boolean(draft),
  };
}

/** Saves a new draft revision (the whole page). */
export async function saveHomepageDraft(db: Database, userId: string, draft: Omit<DraftSnapshot, "kind">, audit: { action?: string; metadata?: Record<string, unknown> } = {}) {
  const { theme, page } = await ensureHomepage(db);
  await db.transaction(async (tx) => {
    await tx.execute(lock);
    const incoming = draft.sections.map((s) => ({ type: s.type, isVisible: s.isVisible, settings: s.settings }));
    const sections = keepSavedBanners(incoming, await currentSections(tx, theme.id, page.id)).map(withKey);
    const snapshot: DraftSnapshot = { kind: "draft", themeSettings: draft.themeSettings, sections };
    await tx.insert(themeRevisions).values({ themeId: theme.id, snapshot, message: "Draft saved", createdByUserId: userId });
    await tx.insert(auditLogs).values({ actorUserId: userId, action: audit.action ?? "HOMEPAGE_DRAFT_SAVED", entityType: "theme", entityId: theme.id, metadata: { sectionCount: draft.sections.length, ...audit.metadata } });
  });
  return theme.id;
}

/**
 * Replaces only the given sections' settings in the latest draft (or live
 * page), inside one locked transaction, so a banner edit never overwrites
 * layout changes saved at the same time in Admin. Each edit names the section
 * by position and type; a mismatch means the layout changed meanwhile.
 */
export async function updateHomepageSections(db: Database, userId: string, edits: Array<{ position: number; type: string; isVisible?: boolean; settings: Record<string, unknown> }>) {
  const { theme, page } = await ensureHomepage(db);
  await db.transaction(async (tx) => {
    await tx.execute(lock);
    const draft = await getPendingDraft(tx, theme.id);
    const themeSettings = draft?.themeSettings
      ?? ((await tx.select({ settings: themes.settings }).from(themes).where(eq(themes.id, theme.id)).limit(1))[0]?.settings ?? {}) as Record<string, unknown>;
    const sections = (await currentSections(tx, theme.id, page.id)).map((s) => ({ ...s }));
    for (const edit of edits) {
      const target = sections[edit.position];
      const sameKey = typeof target?.settings.sectionKey !== "string" || target.settings.sectionKey === edit.settings.sectionKey;
      if (!target || target.type !== edit.type || !sameKey) throw new AppError("CONFLICT", "The home page layout was changed in Admin. Reload the Banner Studio and try again.");
      target.settings = edit.settings;
      if (edit.isVisible !== undefined) target.isVisible = edit.isVisible;
    }
    await tx.insert(themeRevisions).values({ themeId: theme.id, snapshot: { kind: "draft", themeSettings, sections: sections.map(withKey) } satisfies DraftSnapshot, message: "Banners saved", createdByUserId: userId });
    await tx.insert(auditLogs).values({ actorUserId: userId, action: "HOMEPAGE_BANNERS_SAVED", entityType: "theme", entityId: theme.id, metadata: { positions: edits.map((e) => e.position) } });
  });
}

/** Makes the pending draft (if any) the live homepage, atomically. */
export async function publishHomepage(db: Database, userId: string, themeId: string, message?: string) {
  const theme = (await db.select().from(themes).where(eq(themes.id, themeId)).limit(1))[0];
  if (!theme) throw new AppError("NOT_FOUND", "Theme not found");
  const page = (await db.select().from(pages).where(and(eq(pages.themeId, theme.id), eq(pages.slug, "home"))).limit(1))[0];
  if (!page) throw new AppError("NOT_FOUND", "Homepage not found");

  const sectionCount = await db.transaction(async (tx) => {
    // Serialize publishes so two people cannot concurrently make different themes live.
    await tx.execute(lock);
    const draft = await getPendingDraft(tx, theme.id);
    let themeSettings = theme.settings;
    if (draft) {
      themeSettings = draft.themeSettings;
      await tx.update(themes).set({ settings: draft.themeSettings, updatedAt: new Date() }).where(eq(themes.id, theme.id));
      await tx.delete(pageSections).where(eq(pageSections.pageId, page.id));
      if (draft.sections.length) {
        await tx.insert(pageSections).values(draft.sections.map((section, index) => ({
          pageId: page.id, type: section.type as typeof pageSections.$inferInsert.type, position: index, isVisible: section.isVisible, settings: section.settings,
        })));
      }
    }
    const sections = await tx.select().from(pageSections).where(eq(pageSections.pageId, page.id)).orderBy(asc(pageSections.position));
    await tx.update(themes).set({ status: "ARCHIVED", updatedAt: new Date() }).where(and(eq(themes.status, "PUBLISHED")));
    await tx.update(themes).set({ status: "PUBLISHED", updatedAt: new Date() }).where(eq(themes.id, theme.id));
    await tx.update(pages).set({ status: "PUBLISHED", updatedAt: new Date() }).where(eq(pages.id, page.id));
    await tx.insert(themeRevisions).values({ themeId: theme.id, snapshot: { kind: "publish", themeSettings, sections, publishedAt: new Date().toISOString() }, message: message ?? "Published from Online Store", createdByUserId: userId });
    await tx.insert(auditLogs).values({ actorUserId: userId, action: "HOMEPAGE_PUBLISHED", entityType: "theme", entityId: theme.id, metadata: { sectionCount: sections.length, message: message ?? null } });
    return sections.length;
  });
  return { themeId: theme.id, pageId: page.id, sectionCount };
}
