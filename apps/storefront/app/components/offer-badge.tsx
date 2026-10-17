import type { OfferBadge as Badge } from "../lib/offers";

const TONES: Record<string, string> = {
  SAFFRON: "bg-gradient-to-r from-[#ff9933] to-brand-600 text-white",
  GREEN: "bg-gradient-to-r from-[#1a9e10] to-india-dark text-white",
  RED: "bg-gradient-to-r from-rose-500 to-red-600 text-white",
  NAVY: "bg-gradient-to-r from-navy-soft to-navy text-white",
  PINK: "bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white",
  PURPLE: "bg-gradient-to-r from-violet-500 to-purple-700 text-white",
};

/** Highlighted offer badge ("Price drop", "Deal of the day", ...). */
export function OfferBadge({ badge, size = "sm" }: { badge: Pick<Badge, "label" | "tone" | "kind">; size?: "sm" | "md" }) {
  return (
    <span className={"inline-flex items-center gap-1 whitespace-nowrap rounded-full font-bold uppercase tracking-[0.04em] shadow-sm " + (size === "md" ? "px-3 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]") + " " + (TONES[badge.tone] ?? TONES.SAFFRON)}>
      {badge.kind === "price_drop" ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7" /></svg> : <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7.4 7.4a1 1 0 0 1-1.4 0l-8.2-8.4ZM8 9.4a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z" /></svg>}
      {badge.label}
    </span>
  );
}
