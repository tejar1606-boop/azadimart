import { createDatabase, categories } from "@azadimart/database";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = createDatabase();
    const rows = await db.select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
    }).from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.sortOrder), asc(categories.name));
    return NextResponse.json({ items: rows });
  } catch {
    return NextResponse.json({ items: [], error: "Unable to load categories." }, { status: 500 });
  }
}
