import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, navigation, themes } from "@azadimart/database";
import { AppError, navigationSchema, toApiError } from "@azadimart/shared";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const DEFAULT_ITEMS = [
  { label: "Home", href: "/", isActive: true },
  { label: "Shop", href: "/products", isActive: true },
  { label: "Coupons", href: "/products?offers=1", isActive: true },
  { label: "Become a seller", href: "/seller", isActive: true },
];

async function getPrimaryNavigation() {
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

  let nav = (await db.select().from(navigation).where(and(
    eq(navigation.themeId, theme.id),
    eq(navigation.handle, "main-menu"),
  )).limit(1))[0];

  if (!nav) {
    nav = (await db.insert(navigation).values({
      themeId: theme.id,
      handle: "main-menu",
      items: DEFAULT_ITEMS,
    }).returning())[0];
    if (!nav) throw new AppError("INTERNAL", "Navigation creation failed", undefined, false);
  }

  return { db, theme, nav };
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { nav } = await getPrimaryNavigation();
    const items = Array.isArray(nav.items) ? nav.items : [];
    return NextResponse.json({ navigation: items });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function PUT(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const input = navigationSchema.parse(await request.json());
    const { db, nav } = await getPrimaryNavigation();

    const nextItems = input.items.map((item, index) => ({
      ...item,
      position: index,
    }));

    await db.update(navigation).set({
      items: nextItems,
      updatedAt: new Date(),
    }).where(eq(navigation.id, nav.id));

    return NextResponse.json({ ok: true, navigation: nextItems });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}