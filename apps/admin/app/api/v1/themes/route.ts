import { createDatabase, themeRevisions, themes } from "@azadimart/database";
import { requireApiAccess } from "@azadimart/auth";
import { toApiError } from "@azadimart/shared";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();

    const [themeRows, revisionRows] = await Promise.all([
      db
        .select({
          id: themes.id,
          name: themes.name,
          status: themes.status,
          settings: themes.settings,
          createdAt: themes.createdAt,
          updatedAt: themes.updatedAt,
        })
        .from(themes)
        .orderBy(desc(themes.updatedAt)),
      db
        .select({
          id: themeRevisions.id,
          themeId: themeRevisions.themeId,
          message: themeRevisions.message,
          createdByUserId: themeRevisions.createdByUserId,
          createdAt: themeRevisions.createdAt,
        })
        .from(themeRevisions)
        .orderBy(desc(themeRevisions.createdAt)),
    ]);

    return NextResponse.json({
      themes: themeRows,
      revisions: revisionRows,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
