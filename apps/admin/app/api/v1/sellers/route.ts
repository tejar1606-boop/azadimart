import { requireApiAccess } from "@azadimart/auth";
import {
  createDatabase,
  sellerDocuments,
  sellerVerifications,
  sellers,
  users,
} from "@azadimart/database";
import { paginationSchema, toApiError } from "@azadimart/shared";
import { desc, eq } from "drizzle-orm";
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
        email: users.email,
        phone: users.phone,
        gstin: sellers.gstin,
        status: sellers.status,
        verificationStatus: sellerVerifications.status,
        documentCount: sellerDocuments.id,
        approvedAt: sellers.approvedAt,
        createdAt: sellers.createdAt,
        updatedAt: sellers.updatedAt,
      })
      .from(sellers)
      .innerJoin(users, eq(users.id, sellers.userId))
      .leftJoin(sellerVerifications, eq(sellerVerifications.sellerId, sellers.id))
      .leftJoin(sellerDocuments, eq(sellerDocuments.sellerId, sellers.id))
      .orderBy(desc(sellers.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const grouped = new Map<string, (typeof rows)[number] & { documentCount: number }>();
    for (const row of rows) {
      const current = grouped.get(row.id);
      if (!current) {
        grouped.set(row.id, { ...row, documentCount: row.documentCount ? 1 : 0 });
      } else {
        current.documentCount += row.documentCount ? 1 : 0;
      }
    }

    return NextResponse.json({
      sellers: [...grouped.values()],
      page,
      pageSize,
      actorUserId: principal.userId,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
