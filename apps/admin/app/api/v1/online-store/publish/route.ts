import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, pageSections, pages, themeRevisions, themes } from "@azadimart/database";
import { AppError, publishThemeSchema, toApiError } from "@azadimart/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = publishThemeSchema.parse(await request.json());
    const db = createDatabase();

    const theme = (await db.select().from(themes).where(eq(themes.id, input.themeId)).limit(1))[0];
    if (!theme) throw new AppError("NOT_FOUND", "Theme not found");

    const page = (await db.select().from(pages).where(and(eq(pages.themeId, theme.id), eq(pages.slug, "home"))).limit(1))[0];
    if (!page) throw new AppError("NOT_FOUND", "Homepage not found");

    const sections = await db.select().from(pageSections).where(eq(pageSections.pageId, page.id)).orderBy(asc(pageSections.position));

    await db.transaction(async (tx) => {
      await tx.update(themes).set({ status: "ARCHIVED", updatedAt: new Date() })
        .where(and(eq(themes.status, "PUBLISHED")));
      await tx.update(themes).set({ status: "PUBLISHED", updatedAt: new Date() }).where(eq(themes.id, theme.id));
      await tx.update(pages).set({ status: "PUBLISHED", updatedAt: new Date() }).where(eq(pages.id, page.id));
      await tx.insert(themeRevisions).values({
        themeId: theme.id,
        snapshot: {
          themeSettings: theme.settings,
          sections,
          publishedAt: new Date().toISOString(),
        },
        message: input.message ?? "Published from Online Store",
        createdByUserId: principal.userId,
      });
    });

    return NextResponse.json({ ok: true, themeId: theme.id, pageId: page.id, sectionCount: sections.length });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}