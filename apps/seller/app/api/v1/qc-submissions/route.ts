import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, products, qcSubmissions, sellers } from "@azadimart/database";
import { AppError, qcSubmissionSchema, toApiError } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    const sellerId = principal.sellerId;
    if (!sellerId) {
      throw new AppError("FORBIDDEN", "Seller profile is required");
    }

    const db = createDatabase();
    const sellerRows = await db
      .select({ id: sellers.id, status: sellers.status })
      .from(sellers)
      .where(eq(sellers.id, sellerId))
      .limit(1);
    const seller = sellerRows[0];
    if (!seller || seller.status !== "ACTIVE") {
      throw new AppError("FORBIDDEN", "Seller account is not active");
    }

    const input = qcSubmissionSchema.parse(await request.json());

    const productRows = await db
      .select({
        id: products.id,
        status: products.status,
      })
      .from(products)
      .where(
        and(
          eq(products.id, input.productId),
          eq(products.sellerId, sellerId),
        ),
      )
      .limit(1);

    const product = productRows[0];
    if (!product) {
      throw new AppError("NOT_FOUND", "Product not found");
    }
    if (!["DRAFT", "QC_REJECTED"].includes(product.status)) {
      throw new AppError("CONFLICT", "Product is not eligible for QC submission");
    }

    const submission = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(qcSubmissions)
        .values({
          productId: product.id,
          sellerId,
          status: "PENDING",
          notes: input.notes ?? null,
        })
        .returning({
          id: qcSubmissions.id,
          productId: qcSubmissions.productId,
          status: qcSubmissions.status,
          createdAt: qcSubmissions.createdAt,
        });

      const created = inserted[0];
      if (!created) {
        throw new AppError("INTERNAL", "QC submission failed", undefined, false);
      }

      const updated = await tx
        .update(products)
        .set({ status: "PENDING_QC", updatedAt: new Date() })
        .where(
          and(
            eq(products.id, product.id),
            inArray(products.status, ["DRAFT", "QC_REJECTED"]),
          ),
        )
        .returning({ id: products.id });

      if (!updated[0]) {
        throw new AppError("CONFLICT", "Product is no longer eligible for QC submission");
      }

      return created;
    });

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
