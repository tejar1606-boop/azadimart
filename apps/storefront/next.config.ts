import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Browsers must always use HTTPS for this site (ignored on http://localhost).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // Gives this app its own login cookie name (see SESSION_COOKIE_NAME in @azadimart/auth).
  env: { AZADIMART_APP: "storefront" },
  transpilePackages: [
    "@azadimart/ui",
    "@azadimart/notify",
    "@azadimart/shared",
    "@azadimart/auth",
    "@azadimart/payments",
    "@azadimart/storage",
  ],
  images: {
    // Keep high-quality uploads (e.g. WebP at quality 95) crisp: the optimizer
    // re-encodes at 90 (Next's default is 75). Banners are served unoptimized.
    qualities: [90],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
