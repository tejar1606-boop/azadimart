"use client";

import { useEffect } from "react";
import { countAdView } from "../lib/ad-tracking";
import ProductCard, { type ProductCardData } from "./product-card";

/** Home page sponsored products: each card is labelled "Sponsored" and its view is counted once shown. */
export default function SponsoredRow({ items }: { items: Array<{ bidId: string; product: ProductCardData }> }) {
  useEffect(() => { items.forEach((item) => countAdView(item.bidId)); }, [items]);
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {items.map(({ bidId, product }) => <ProductCard key={bidId} product={{ ...product, sponsoredHref: `/api/v1/ads/click/${bidId}` }} />)}
    </div>
  );
}
