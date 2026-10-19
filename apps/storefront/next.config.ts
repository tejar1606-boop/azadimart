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
  // Lets phones on the same Wi-Fi open the dev server (e.g. http://192.168.x.x:3000). Dev only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // Hide the Next.js dev-tools "N" button in local development (it covered the mobile tab bar). Production never shows it.
  devIndicators: false,
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
