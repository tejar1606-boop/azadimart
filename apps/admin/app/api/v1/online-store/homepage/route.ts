import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, pageSections, pages, themeRevisions, themes } from "@azadimart/database";
import { AppError, DEFAULT_HOME_SECTIONS, saveHomepageSchema, toApiError } from "@azadimart/shared";
import { asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { type DraftSnapshot, getPendingDraft } from "../homepage-draft";

async function ensureHomepage() {
  const db = createDatabase();

  // Serialize first-run homepage initialization with draft saves and publishing.
  // Without this, two concurrent admin requests could both observe a missing
  // default theme/page and create duplicate homepage state.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('azadimart:theme_publish'))`);

    let theme = (await tx.select().from(themes).where(eq(themes.name, "AzadiMart Core")).limit(1))[0];

    if (!theme) {
      const created = (await tx.insert(themes).values({
        name: "AzadiMart Core",
        status: "DRAFT",
        settings: { mode: "premium-india", surface: "light" },
      }).returning())[0];
      if (!created) throw new AppError("INTERNAL", "Theme creation failed", undefined, false);
      theme = created;
    }

    const page = (await tx.select().from(pages).where(eq(pages.themeId, theme.id)).limit(1))[0];

    if (!page) {
      const created = (await tx.insert(pages).values({
        themeId: theme.id,
        slug: "home",
        title: "Homepage",
        status: "DRAFT",
      }).returning())[0];
      if (!created) throw new AppError("INTERNAL", "Homepage creation failed", undefined, false);

      await tx.insert(pageSections).values(DEFAULT_HOME_SECTIONS.map((section) => ({
        pageId: created.id,
        type: section.type,
        position: section.position,
        isVisible: section.isVisible,
        settings: section.settings,
      })));
    }
  });

  const theme = (await db.select().from(themes).where(eq(themes.name, "AzadiMart Core")).limit(1))[0];
  if (!theme) throw new AppError("INTERNAL", "Homepage theme missing", undefined, false);

  const page = (await db.select().from(pages).where(eq(pages.themeId, theme.id)).limit(1))[0];
  if (!page) throw new AppError("INTERNAL", "Homepage missing", undefined, false);

  const sections = await db.select().from(pageSections)
    .where(eq(pageSections.pageId, page.id))
    .orderBy(asc(pageSections.position));

  return { db, theme, page, sections };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { db, theme, page, sections } = await ensureHomepage();
    const draft = await getPendingDraft(db, theme.id);
    return NextResponse.json({
      theme: { id: theme.id, name: theme.name, status: theme.status, settings: draft?.themeSettings ?? theme.settings },
      page: { id: page.id, title: page.title, status: page.status },
      sections: draft
        ? draft.sections.map((section, index) => ({ id: "draft-" + index, pageId: page.id, position: index, ...section }))
        : sections,
      hasUnpublishedChanges: Boolean(draft),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = saveHomepageSchema.parse(await request.json());
    const { db, theme } = await ensureHomepage();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('azadimart:theme_publish'))`);
      const snapshot: DraftSnapshot = {
        kind: "draft",
        themeSettings: input.themeSettings,
        sections: input.sections.map((section) => ({ type: section.type, isVisible: section.isVisible, settings: section.settings })),
      };
      await tx.insert(themeRevisions).values({
        themeId: theme.id,
        snapshot,
        message: "Draft saved",
        createdByUserId: principal.userId,
      });
      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "HOMEPAGE_DRAFT_SAVED",
        entityType: "theme",
        entityId: theme.id,
        metadata: { sectionCount: input.sections.length },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE() {
  return NextResponse.json(
    { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use section editing in the Online Store editor." } },
    { status: 405 },
  );
}

