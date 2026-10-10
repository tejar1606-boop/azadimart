/** Public address of the store, used for canonical links, the sitemap and link previews. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.AUTH_URL_STOREFRONT || "https://azadimart.com").replace(/\/$/, "");
export const SITE_NAME = "AzadiMart";

/** Absolute URL for a path on the store. */
export const absoluteUrl = (path: string) => (path.startsWith("http") ? path : SITE_URL + (path.startsWith("/") ? path : "/" + path));

/** Plain text clipped at a word boundary, for meta descriptions (Google shows about 155–160 characters). */
export function clip(text: string | null | undefined, max = 158): string {
  const plain = (text ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length).replace(/[,.;:\s-]+$/, "") + "…";
}

/** Serialise structured data safely inside a <script> tag (no "</script>" breakouts). */
export const jsonLd = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });

/** Pages that should never appear in search results. */
export const PRIVATE_PATHS = ["/cart", "/checkout", "/account", "/login", "/register", "/wishlist", "/api/"];
