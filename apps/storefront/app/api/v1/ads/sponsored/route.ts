import { categories, createDatabase, liveAds } from "@azadimart/database";
import { settleAdAuctions } from "@azadimart/notify";
import { uuidSchema } from "@azadimart/shared";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { GET as catalogProducts } from "../../catalog/products/route";

export const dynamic = "force-dynamic";

type CatalogItem = { id: string; title: string; categoryName?: string };

/**
 * Today's sponsored products for the product list: the category placement on
 * a category page (or its parent's), otherwise the search/All-products
 * placement. For a search, an ad shows only if the product matches a word of
 * the search, so shoppers don't get unrelated products.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const categoryId = url.searchParams.get("categoryId") ?? "";
    const db = createDatabase();
    await settleAdAuctions(db);
    let ads;
    if (categoryId && uuidSchema.safeParse(categoryId).success) {
      const parent = (await db.select({ parentId: categories.parentId }).from(categories).where(eq(categories.id, categoryId)).limit(1))[0]?.parentId;
      ads = (await liveAds(db, "CATEGORY_TOP")).filter((a) => a.categoryId === categoryId || (parent && a.categoryId === parent));
    } else {
      ads = await liveAds(db, "SEARCH_TOP");
    }
    if (!ads.length) return NextResponse.json({ items: [] });
    const ids = [...new Set(ads.map((a) => a.productId))];
    const response = await catalogProducts(new Request(new URL(`/api/v1/catalog/products?limit=10&ids=${ids.join(",")}`, request.url)));
    const catalog = ((await response.json()) as { items?: CatalogItem[] }).items ?? [];
    const words = q.split(/\s+/).filter((w) => w.length >= 3);
    const relevant = (p: CatalogItem) => !words.length || words.some((w) => `${p.title} ${p.categoryName ?? ""}`.toLowerCase().includes(w));
    const seen = new Set<string>();
    const items = ads.flatMap((ad) => {
      const product = catalog.find((p) => p.id === ad.productId);
      if (!product || seen.has(product.id) || !relevant(product)) return [];
      seen.add(product.id);
      return [{ bidId: ad.bidId, product }];
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] }); // ads must never break the shop
  }
}
