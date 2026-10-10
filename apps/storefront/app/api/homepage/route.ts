import { createDatabase, pageSections, pages, themes } from "@azadimart/database";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const db = createDatabase();
  const theme = (await db.select().from(themes).where(eq(themes.status, "PUBLISHED")).limit(1))[0];
  if (!theme) return NextResponse.json({ theme: null, page: null, sections: [] });
  const page = (await db.select().from(pages).where(and(eq(pages.themeId, theme.id), eq(pages.slug, "home"), eq(pages.status, "PUBLISHED"))).limit(1))[0];
  if (!page) return NextResponse.json({ theme: null, page: null, sections: [] });
  const sections = await db.select().from(pageSections).where(eq(pageSections.pageId, page.id)).orderBy(asc(pageSections.position));
  return NextResponse.json({ theme: { id:theme.id, settings:theme.settings }, page: { id:page.id, title:page.title }, sections });
}