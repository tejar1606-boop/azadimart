import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, pageSections, pages, themeRevisions, themes } from "@azadimart/database";
import { getPendingDraft } from "../homepage-draft";
import { AppError, publishThemeSchema, toApiError } from "@azadimart/shared";
import { and, asc, eq, sql } from "drizzle-orm";
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

    const sectionCount = await db.transaction(async (tx) => {
      // Serialize publishes so two admins cannot concurrently make different themes live.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('azadimart:theme_publish'))`);

      // Copy the pending draft (if any) into the live homepage atomically.
      const draft = await getPendingDraft(tx, theme.id);
      let themeSettings = theme.settings;
      if (draft) {
        themeSettings = draft.themeSettings;
        await tx.update(themes).set({ settings: draft.themeSettings, updatedAt: new Date() }).where(eq(themes.id, theme.id));
        await tx.delete(pageSections).where(eq(pageSections.pageId, page.id));
        if (draft.sections.length) {
          await tx.insert(pageSections).values(draft.sections.map((section, index) => ({
            pageId: page.id,
            type: section.type as typeof pageSections.$inferInsert.type,
            position: index,
            isVisible: section.isVisible,
            settings: section.settings,
          })));
        }
      }
      const sections = await tx.select().from(pageSections).where(eq(pageSections.pageId, page.id)).orderBy(asc(pageSections.position));

      await tx.update(themes).set({ status: "ARCHIVED", updatedAt: new Date() })
        .where(and(eq(themes.status, "PUBLISHED")));
      await tx.update(themes).set({ status: "PUBLISHED", updatedAt: new Date() }).where(eq(themes.id, theme.id));
      await tx.update(pages).set({ status: "PUBLISHED", updatedAt: new Date() }).where(eq(pages.id, page.id));
      await tx.insert(themeRevisions).values({
        themeId: theme.id,
        snapshot: {
          kind: "publish",
          themeSettings,
          sections,
          publishedAt: new Date().toISOString(),
        },
        message: input.message ?? "Published from Online Store",
        createdByUserId: principal.userId,
      });
      await tx.insert(auditLogs).values({
        actorUserId: principal.userId,
        action: "HOMEPAGE_PUBLISHED",
        entityType: "theme",
        entityId: theme.id,
        metadata: { sectionCount: sections.length, message: input.message ?? null },
      });
      return sections.length;
    });

    return NextResponse.json({ ok: true, themeId: theme.id, pageId: page.id, sectionCount });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}