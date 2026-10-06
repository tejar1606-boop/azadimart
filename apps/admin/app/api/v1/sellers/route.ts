import { requireApiAccess } from "@azadimart/auth";
import {
  createDatabase,
  sellerDocuments,
  sellerVerifications,
  sellers,
  users,
} from "@azadimart/database";
import { paginationSchema, toApiError } from "@azadimart/shared";
import { desc, eq, inArray, sql } from "drizzle-orm";
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
        approvedAt: sellers.approvedAt,
        createdAt: sellers.createdAt,
        updatedAt: sellers.updatedAt,
      })
      .from(sellers)
      .innerJoin(users, eq(users.id, sellers.userId))
      .leftJoin(sellerVerifications, eq(sellerVerifications.sellerId, sellers.id))
      .orderBy(desc(sellers.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const sellerIds = rows.map((row) => row.id);
    const documentCounts = sellerIds.length
      ? await db
          .select({
            sellerId: sellerDocuments.sellerId,
            count: sql<number>`count(*)`.as("count"),
          })
          .from(sellerDocuments)
          .where(inArray(sellerDocuments.sellerId, sellerIds))
          .groupBy(sellerDocuments.sellerId)
      : [];

    const countMap = new Map(documentCounts.map((row) => [row.sellerId, Number(row.count)]));

    return NextResponse.json({
      sellers: rows.map((row) => ({
        ...row,
        documentCount: countMap.get(row.id) ?? 0,
      })),
      page,
      pageSize,
      actorUserId: principal.userId,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
