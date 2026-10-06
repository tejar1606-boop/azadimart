import { createDatabase, sellers } from "@azadimart/database";
import { requireApiAccess } from "@azadimart/auth";
import { paginationSchema, toApiError } from "@azadimart/shared";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = paginationSchema.parse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });

    const db = createDatabase();
    const rows = await db
      .select({
        id: sellers.id,
        storeName: sellers.storeName,
        legalName: sellers.legalName,
        gstin: sellers.gstin,
        status: sellers.status,
        approvedAt: sellers.approvedAt,
        createdAt: sellers.createdAt,
        updatedAt: sellers.updatedAt,
      })
      .from(sellers)
      .orderBy(desc(sellers.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return NextResponse.json({
      sellers: rows,
      page,
      pageSize,
      actorUserId: principal.userId,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
