// Plain lazy <img>/<video> keep this shared package framework-light (used by storefront, seller and admin).
import type { AplusBlock } from "@azadimart/shared";

export type AplusProductSummary = { id: string; title: string; imageUrl: string | null; pricePaise: number | null; href?: string };

const money = (paise: number) => "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Media({ image, video, alt, className }: { image?: string; video?: string; alt: string; className: string }) {
  if (video) return <video className={className} src={video} poster={image} autoPlay muted loop playsInline preload="metadata" aria-label={alt} />;
  if (image) return <img className={className} src={image} alt={alt} loading="lazy" decoding="async" />;
  return null;
}

/**
 * Renders A+ content blocks. All values are plain text and media URLs that
 * were validated server-side; nothing is injected as HTML.
 */
export function AplusContent({
  blocks,
  product,
  compared = {},
}: {
  blocks: AplusBlock[];
  /** The product the content belongs to (first column of comparison tables). */
  product: AplusProductSummary;
  compared?: Record<string, AplusProductSummary>;
}) {
  if (!blocks.length) return null;
  return (
    <div className="space-y-8 sm:space-y-10">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "banner":
            return (
              <div key={index} className="overflow-hidden rounded-2xl bg-slate-100">
                <Media image={block.mobileImageUrl ?? block.desktopImageUrl} video={block.mobileVideoUrl ?? (block.mobileImageUrl ? undefined : block.desktopVideoUrl)} alt={block.alt || product.title} className="block aspect-[4/3] w-full object-cover sm:hidden" />
                <Media image={block.desktopImageUrl} video={block.desktopVideoUrl} alt={block.alt || product.title} className="hidden aspect-[1464/600] w-full object-cover sm:block" />
              </div>
            );
          case "image_text":
            return (
              <div key={index} className={"grid items-center gap-5 sm:gap-8 " + (block.imageUrl ? "md:grid-cols-2" : "")}>
                {block.imageUrl ? (
                  <img src={block.imageUrl} alt={block.heading} loading="lazy" className={"aspect-square w-full rounded-2xl object-cover " + (block.imagePosition === "right" ? "md:order-2" : "")} />
                ) : null}
                <div className={block.imageUrl ? "" : "mx-auto max-w-3xl text-center"}>
                  <h3 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{block.heading}</h3>
                  {block.body ? <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{block.body}</p> : null}
                </div>
              </div>
            );
          case "features":
            return (
              <div key={index}>
                {block.heading ? <h3 className="mb-5 text-center text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{block.heading}</h3> : null}
                <div className={"grid gap-5 sm:gap-6 " + (block.items.length === 3 ? "sm:grid-cols-3" : block.items.length === 2 ? "sm:grid-cols-2" : "")}>
                  {block.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="text-center">
                      {item.imageUrl ? <img src={item.imageUrl} alt={item.title} loading="lazy" className="mb-4 aspect-square w-full rounded-2xl object-cover" /> : null}
                      <p className="text-base font-semibold">{item.title}</p>
                      {item.text ? <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.text}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          case "comparison": {
            const columns = [product, ...block.productIds.map((id) => compared[id]).filter((item): item is AplusProductSummary => Boolean(item))];
            return (
              <div key={index}>
                {block.heading ? <h3 className="mb-5 text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{block.heading}</h3> : null}
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="w-40 p-4" />
                        {columns.map((column, columnIndex) => (
                          <th key={column.id} className={"p-4 align-top font-medium " + (columnIndex === 0 ? "bg-slate-50" : "")}>
                            {column.imageUrl ? <img src={column.imageUrl} alt="" loading="lazy" className="mb-2 aspect-square w-20 rounded-lg object-cover" /> : null}
                            {column.href && columnIndex > 0 ? <a href={column.href} className="line-clamp-2 hover:underline">{column.title}</a> : <span className="line-clamp-2">{column.title}</span>}
                            {column.pricePaise !== null ? <span className="mt-1 block font-semibold">{money(column.pricePaise)}</span> : null}
                            {columnIndex === 0 ? <span className="mt-1 inline-block rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">This item</span> : null}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="border-b border-slate-100 last:border-0">
                          <th scope="row" className="p-4 font-medium text-slate-500">{row.label}</th>
                          {columns.map((column, columnIndex) => (
                            <td key={column.id} className={"p-4 " + (columnIndex === 0 ? "bg-slate-50 font-medium" : "")}>{row.values[columnIndex] || "—"}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }
          case "text":
            return (
              <div key={index} className="mx-auto max-w-3xl">
                {block.heading ? <h3 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{block.heading}</h3> : null}
                <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{block.body}</p>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
