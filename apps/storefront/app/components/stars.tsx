/** Read-only star rating with partial fill (e.g. 4.3 stars). */
export function Stars({ value, size = 16, className = "" }: { value: number; size?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  const row = (fill: string) => (
    // Fixed width so the gold overlay is clipped (not squeezed) at partial ratings.
    <span className="flex shrink-0" style={{ width: size * 5 }} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={fill} className="shrink-0"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8L12 2.8Z" /></svg>
      ))}
    </span>
  );
  return (
    <span className={"relative inline-flex " + className} role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {row("#e2e8f0")}
      <span className="absolute inset-y-0 left-0 overflow-hidden text-amber-500" style={{ width: `${pct}%` }}>{row("#f59e0b")}</span>
    </span>
  );
}

/** Meesho-style green rating pill: "4.3 ★" (colour by score). */
export function RatingPill({ average, count, compact = false }: { average: number; count: number; compact?: boolean }) {
  if (!count) return null;
  const tone = average >= 4 ? "bg-india" : average >= 3 ? "bg-[#7cb342]" : average >= 2 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={"inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold text-white " + tone}>{average.toFixed(1)}<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8L12 2.8Z" /></svg></span>
      <span className="text-slate-500">{compact ? `(${count.toLocaleString("en-IN")})` : `${count.toLocaleString("en-IN")} rating${count === 1 ? "" : "s"}`}</span>
    </span>
  );
}
