import Image from "next/image";
import Link from "next/link";
import WishlistButton from "./wishlist-button";

export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  pricePaise: number;
  compareAtPaise?: number | null;
  mediaStorageKey?: string | null;
  mediaAltText?: string | null;
  sellerName?: string | null;
};

export const formatPrice = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export function discountPercent(pricePaise: number, compareAtPaise?: number | null): number {
  if (!compareAtPaise || compareAtPaise <= pricePaise) return 0;
  return Math.round((1 - pricePaise / compareAtPaise) * 100);
}

export default function ProductCard({ product, priority = false, sizes = "(max-width: 640px) 46vw, (max-width: 1024px) 30vw, 22vw" }: { product: ProductCardData; priority?: boolean; sizes?: string }) {
  const off = discountPercent(product.pricePaise, product.compareAtPaise);
  return (
    <Link href={"/products/" + product.slug} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition duration-300 hover:-translate-y-0.5 hover:shadow-lift focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {product.mediaStorageKey ? (
          <Image
            src={"/media/" + product.mediaStorageKey}
            alt={product.mediaAltText ?? product.title}
            fill
            priority={priority}
            sizes={sizes}
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="grid h-full place-items-center bg-gradient-to-br from-slate-100 to-brand-50 text-4xl font-semibold text-slate-300">{product.title.slice(0, 1).toUpperCase()}</span>
        )}
        {off > 0 ? <span className="absolute left-2.5 top-2.5 rounded-full bg-save px-2 py-0.5 text-[11px] font-semibold text-white">{off}% off</span> : null}
        <WishlistButton productId={product.id} />
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-3.5">
        {product.sellerName ? <p className="truncate text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{product.sellerName}</p> : null}
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-slate-800 sm:text-sm">{product.title}</p>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
          <span className="text-base font-semibold text-slate-950 sm:text-lg">{formatPrice(product.pricePaise)}</span>
          {off > 0 ? <span className="text-xs text-slate-400 line-through">{formatPrice(product.compareAtPaise!)}</span> : null}
        </div>
      </div>
    </Link>
  );
}
