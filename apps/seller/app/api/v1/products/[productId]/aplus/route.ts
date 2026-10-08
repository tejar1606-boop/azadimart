import { productAplusContent, productSummaries } from "@azadimart/database";
import { type AplusBlock, aplusComparedProductIds, aplusSaveSchema, toApiError } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { assertBlocksOwned, requireOwnedProduct } from "./shared";

type Params = { params: Promise<{ productId: string }> };

export async function GET(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const { productId } = await params;
    const { db, product } = await requireOwnedProduct(request, productId);
    const row = (await db.select().from(productAplusContent).where(eq(productAplusContent.productId, product.id)).limit(1))[0];
    const draft = (row?.draftBlocks ?? []) as AplusBlock[];
    const summaries = await productSummaries(db, [product.id, ...aplusComparedProductIds(draft)]);
    return NextResponse.json({
      product: summaries[product.id] ?? { id: product.id, title: product.title, imageUrl: null, pricePaise: null },
      draftBlocks: draft,
      publishedBlockCount: ((row?.blocks ?? []) as unknown[]).length,
      status: row?.status ?? null,
      reviewNotes: row?.reviewNotes ?? null,
      compared: summaries,
    });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}

/** Save the seller's draft. Approved content stays live until a new version is approved. */
export async function PUT(request: Request, { params }: Params) {
  const requestId = crypto.randomUUID();
  try {
    const { productId } = await params;
    const { db, principal, product } = await requireOwnedProduct(request, productId);
    const { blocks } = aplusSaveSchema.parse(await request.json());
    await assertBlocksOwned(db, blocks, principal, product.id);
    const now = new Date();
    await db.insert(productAplusContent).values({ productId: product.id, draftBlocks: blocks, status: "DRAFT", updatedAt: now })
      .onConflictDoUpdate({ target: productAplusContent.productId, set: { draftBlocks: blocks, status: "DRAFT", reviewNotes: null, updatedAt: now } });
    return NextResponse.json({ ok: true, status: "DRAFT", blockCount: blocks.length });
  } catch (error) {
    const { status, body } = toApiError(error, requestId);
    return NextResponse.json(body, { status });
  }
}
