import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, SITE_URL } from "./lib/seo";

/** robots.txt: index the shop, keep carts, accounts and APIs out of search, and point to the sitemap. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...PRIVATE_PATHS, "/products?q="] }],
    sitemap: SITE_URL + "/sitemap.xml",
    host: SITE_URL,
  };
}
