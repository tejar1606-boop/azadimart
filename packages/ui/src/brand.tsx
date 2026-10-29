/** LOIMART brand colours, taken from the main logo. */
export const BRAND_COLORS = { purple: "#6A2CD6", ink: "#2A0E5F", pink: "#EF5A8A", yellow: "#F9CB5B" } as const;

export const BRAND_TAGLINE = "Shop happy. Every day.";

/** The app-icon mark: a smiling white shopping bag on a purple tile, with a yellow bag and sparkle behind. */
export function BrandMark({ size = 36, className = "" }: { size?: number | string; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={"shrink-0 " + className} aria-hidden="true">
      <rect width="200" height="200" rx="46" fill={BRAND_COLORS.purple} />
      <path d="M82 62 L164 60 L155 150 Q154 154 150 154 L108 154 Z" fill={BRAND_COLORS.yellow} />
      <path d="M58 70 V58 a20 20 0 0 1 40 0 V70" fill="none" stroke="#FFFFFF" strokeWidth="10" />
      <path d="M46 82 H132 Q137 82 136.5 87 L130 166 Q129.5 172 124 172 H58 Q52.5 172 52 166 L45.5 87 Q45 82 46 82 Z" fill="#FFFFFF" />
      <path d="M68 122 Q89 142 110 122" fill="none" stroke={BRAND_COLORS.pink} strokeWidth="10" strokeLinecap="round" />
      <path d="M160 22 Q163 36 177 39 Q163 42 160 56 Q157 42 143 39 Q157 36 160 22 Z" fill={BRAND_COLORS.yellow} />
    </svg>
  );
}

/** "loimart" in the logo's two colours. onDark swaps the deep-purple "loi" for white so it reads on dark backgrounds. */
export function BrandWordmark({ onDark = false, className = "" }: { onDark?: boolean; className?: string }) {
  return (
    <span className={"font-extrabold lowercase tracking-[-0.04em] " + className}>
      <span style={{ color: onDark ? "#FFFFFF" : BRAND_COLORS.ink }}>loi</span>
      <span style={{ color: BRAND_COLORS.pink }}>mart</span>
    </span>
  );
}
