import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, products, qcSubmissions, sellers } from "@azadimart/database";
import { AppError, qcSubmissionSchema, toApiError } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) {
      throw new AppError("FORBIDDEN", "Seller profile is required");
    }

    const db = createDatabase();
    const sellerRows = await db
      .select({ id: sellers.id, status: sellers.status })
      .from(sellers)
      .where(eq(sellers.id, principal.sellerId))
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
          eq(products.sellerId, principal.sellerId),
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

    const inserted = await db
      .insert(qcSubmissions)
      .values({
        productId: product.id,
        sellerId: principal.sellerId,
        status: "PENDING",
        notes: input.notes ?? null,
      })
      .returning({
        id: qcSubmissions.id,
        productId: qcSubmissions.productId,
        status: qcSubmissions.status,
        createdAt: qcSubmissions.createdAt,
      });

    const submission = inserted[0];
    if (!submission) {
      throw new AppError("INTERNAL", "QC submission failed", undefined, false);
    }

    await db
      .update(products)
      .set({ status: "PENDING_QC", updatedAt: new Date() })
      .where(
        and(
          eq(products.id, product.id),
          inArray(products.status, ["DRAFT", "QC_REJECTED"]),
        ),
      );

    return NextResponse.json({ submission }, { status: 201 });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
