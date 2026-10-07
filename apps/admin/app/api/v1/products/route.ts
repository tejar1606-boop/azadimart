import { requireApiAccess } from "@azadimart/auth";
import { auditLogs, createDatabase, products, productVariants, sellers } from "@azadimart/database";
import { AppError, toApiError } from "@azadimart/shared";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const db = createDatabase();
    const rows = await db
      .select({
        id: products.id,
        title: products.title,
        slug: products.slug,
        sellerId: products.sellerId,
        sellerName: sellers.storeName,
        status: products.status,
        createdAt: products.createdAt,
      })
      .from(products)
      .innerJoin(sellers, eq(sellers.id, products.sellerId))
      .where(eq(products.status, "PENDING_ADMIN_APPROVAL"))
      .orderBy(products.createdAt);

    const productIds = rows.map((row) => row.id);
    const variants = productIds.length
      ? await db
          .select({
            productId: productVariants.productId,
            id: productVariants.id,
            sku: productVariants.sku,
            title: productVariants.title,
            pricePaise: productVariants.pricePaise,
            weightGrams: productVariants.weightGrams,
            isActive: productVariants.isActive,
          })
          .from(productVariants)
          .where(inArray(productVariants.productId, productIds))
      : [];

    const variantsByProduct = new Map<string, typeof variants>();
    for (const variant of variants) {
      const current = variantsByProduct.get(variant.productId) ?? [];
      current.push(variant);
      variantsByProduct.set(variant.productId, current);
    }

    return NextResponse.json({
      items: rows.map((row) => ({
        ...row,
        variants: variantsByProduct.get(row.id) ?? [],
      })),
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    const principal = await requireApiAccess(request, "admin", ["ADMIN", "SUPER_ADMIN"]);
    const body = (await request.json().catch(() => ({}))) as {
      productId?: string;
      decision?: "APPROVED" | "REJECTED";
      notes?: string;
    };

    if (!body.productId || !/^[0-9a-f-]{36}$/i.test(body.productId)) {
      throw new AppError("VALIDATION_ERROR", "A valid product ID is required");
    }
    if (body.decision !== "APPROVED" && body.decision !== "REJECTED") {
      throw new AppError("VALIDATION_ERROR", "Decision must be APPROVED or REJECTED");
    }

    const productId = body.productId;
    const db = createDatabase();
    const nextStatus = body.decision === "APPROVED" ? "LIVE" : "QC_REJECTED";
    const result = await db.transaction(async (tx) => {
      const updated = await tx
      .update(products)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(
        and(
          eq(products.id, productId),
          eq(products.status, "PENDING_ADMIN_APPROVAL"),
        ),
      )
      .returning({
        id: products.id,
        title: products.title,
        status: products.status,
      });

      const product = updated[0];
      if (!product) {
        throw new AppError("CONFLICT", "Product is not awaiting admin approval");
      }

      await tx.insert(auditLogs).values({
      actorUserId: principal.userId,
      action: `PRODUCT_${body.decision}`,
      entityType: "product",
      entityId: product.id,
        metadata: { notes: body.notes?.trim() || null },
      });

      return product;
    });

    return NextResponse.json({ ok: true, product: result });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
