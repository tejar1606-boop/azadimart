import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, categories, createDatabase, pageBanners } from "@azadimart/database";
import { AppError, PAGE_BANNER_PAGES, pageBannerKeyPattern, pageBannerSchema, toApiError } from "@azadimart/shared";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Every page that can have a banner, with its current banner (if any). */
export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const [banners, cats] = await Promise.all([
      db.select().from(pageBanners),
      db.select({ id: categories.id, name: categories.name, slug: categories.slug, parentId: categories.parentId }).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    ]);
    const byKey = new Map(banners.map((b) => [b.pageKey, b]));
    const ordered = cats.filter((c) => !c.parentId).flatMap((c) => [c, ...cats.filter((x) => x.parentId === c.id)]);
    const pages = [
      ...PAGE_BANNER_PAGES.map((p) => ({ key: p.key as string, label: p.label as string, path: p.path as string, group: "Pages", parentKey: null as string | null })),
      ...ordered.map((c) => ({ key: `category:${c.id}`, label: c.parentId ? `— ${c.name}` : c.name, path: `/c/${c.slug}`, group: "Categories", parentKey: c.parentId ? `category:${c.parentId}` : null })),
    ];
    return NextResponse.json({ pages: pages.map((p) => ({ ...p, banner: byKey.get(p.key) ?? null })) });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Save (create or replace) the banner for one page. */
export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = pageBannerSchema.parse(await request.json());
    const db = createDatabase();
    if (input.pageKey.startsWith("category:")) {
      const exists = await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.pageKey.slice(9))).limit(1);
      if (!exists.length) throw new AppError("NOT_FOUND", "Category not found");
    }
    const values = {
      desktopImageUrl: input.desktopImageUrl, mobileImageUrl: input.mobileImageUrl, href: input.href, alt: input.alt, isActive: input.isActive,
      startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null,
      updatedByUserId: principal.userId, updatedAt: new Date(),
    };
    const [banner] = await db.insert(pageBanners).values({ pageKey: input.pageKey, ...values })
      .onConflictDoUpdate({ target: pageBanners.pageKey, set: values }).returning();
    await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "PAGE_BANNER_SAVED", entityType: "page_banner", entityId: banner!.id, metadata: { pageKey: input.pageKey, isActive: input.isActive } });
    return NextResponse.json({ banner });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Remove a page's banner (?pageKey=…). */
export async function DELETE(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const pageKey = new URL(request.url).searchParams.get("pageKey") ?? "";
    if (!pageBannerKeyPattern.test(pageKey)) throw new AppError("VALIDATION_ERROR", "Unknown page");
    const db = createDatabase();
    const [removed] = await db.delete(pageBanners).where(eq(pageBanners.pageKey, pageKey)).returning({ id: pageBanners.id });
    if (removed) await db.insert(auditLogs).values({ actorUserId: principal.userId, action: "PAGE_BANNER_REMOVED", entityType: "page_banner", entityId: removed.id, metadata: { pageKey } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
