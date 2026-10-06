import { requireApiAccess } from "@azadimart/auth";
import { createDatabase, products, qcSubmissions } from "@azadimart/database";
import { qcSubmissionSchema, toApiError } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();

  try {
    const principal = await requireApiAccess(request, "seller", ["SELLER"]);
    if (!principal.sellerId) {
      throw new Error("Authenticated seller profile is missing");
    }

    const input = qcSubmissionSchema.parse(await request.json());
    const db = createDatabase();

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
      throw new Error("Product not found");
    }
    if (!["DRAFT", "QC_REJECTED"].includes(product.status)) {
      throw new Error("Product is not eligible for QC submission");
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
      throw new Error("QC submission failed");
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
