import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, pageSections, pages, themeRevisions, themes } from "@azadimart/database";
import { AppError, DEFAULT_HOME_SECTIONS, saveHomepageSchema, toApiError } from "@azadimart/shared";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

async function ensureHomepage() {
  const db = createDatabase();
  let theme = (await db.select().from(themes).where(eq(themes.name, "AzadiMart Core")).limit(1))[0];

  if (!theme) {
    const created = (await db.insert(themes).values({
      name: "AzadiMart Core",
      status: "DRAFT",
      settings: { mode: "premium-india", surface: "light" },
    }).returning())[0];
    if (!created) throw new AppError("INTERNAL", "Theme creation failed", undefined, false);
    theme = created;
  }

  let page = (await db.select().from(pages).where(eq(pages.themeId, theme.id)).limit(1))[0];

  if (!page) {
    const created = (await db.insert(pages).values({
      themeId: theme.id,
      slug: "home",
      title: "Homepage",
      status: "DRAFT",
    }).returning())[0];
    if (!created) throw new AppError("INTERNAL", "Homepage creation failed", undefined, false);
    page = created;

    await db.insert(pageSections).values(DEFAULT_HOME_SECTIONS.map((section) => ({
      pageId: page.id,
      type: section.type,
      position: section.position,
      isVisible: section.isVisible,
      settings: section.settings,
    })));
  }

  const sections = await db.select().from(pageSections)
    .where(eq(pageSections.pageId, page.id))
    .orderBy(asc(pageSections.position));

  return { db, theme, page, sections };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { theme, page, sections } = await ensureHomepage();
    return NextResponse.json({
      theme: { id: theme.id, name: theme.name, status: theme.status, settings: theme.settings },
      page: { id: page.id, title: page.title, status: page.status },
      sections,
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
    const { db, theme, page } = await ensureHomepage();

    await db.transaction(async (tx) => {
      await tx.update(themes).set({
        settings: input.themeSettings,
        status: "DRAFT",
        updatedAt: new Date(),
      }).where(eq(themes.id, theme.id));

      await tx.delete(pageSections).where(eq(pageSections.pageId, page.id));
      await tx.insert(pageSections).values(input.sections.map((section, index) => ({
        pageId: page.id,
        type: section.type,
        position: index,
        isVisible: section.isVisible,
        settings: section.settings,
      })));

      await tx.update(pages).set({ status: "DRAFT", updatedAt: new Date() }).where(eq(pages.id, page.id));
      await tx.insert(themeRevisions).values({
        themeId: theme.id,
        snapshot: { themeSettings: input.themeSettings, sections: input.sections },
        message: "Draft saved",
        createdByUserId: principal.userId,
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

export function assertThemeOwner(themeId: string, actualThemeId: string) {
  if (themeId !== actualThemeId) throw new AppError("FORBIDDEN", "Theme does not belong to this store");
}
