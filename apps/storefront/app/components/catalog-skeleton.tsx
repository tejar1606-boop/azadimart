/**
 * Shown while a shop or category page loads. It keeps the page a full screen
 * tall in the catalog's shape, so the footer never jumps up into view between
 * pages (an empty Suspense fallback collapsed the page to nothing).
 */
export default function CatalogSkeleton({ banner = true }: { banner?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading products" className="min-h-[100svh]">
      {banner ? <div className="aspect-[800/329] animate-pulse bg-slate-200 sm:aspect-[1800/320]" /> : null}
      <div className="bg-canvas px-3 py-5 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-[1440px]">
          <div className="h-3 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-3 grid grid-cols-[76px_minmax(0,1fr)] gap-3 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-6 lg:mt-5 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-2xl bg-slate-200 lg:aspect-auto lg:h-10" />)}</div>
            <div className="min-w-0">
              <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
              <div className="mt-2 h-3 w-32 animate-pulse rounded bg-slate-200" />
              <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-200" />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
