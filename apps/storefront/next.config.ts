import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  transpilePackages: [
    "@azadimart/ui",
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
