import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {\n  async headers() {\n    return [{\n      source: "/(.*)",\n      headers: [\n        { key: "X-Content-Type-Options", value: "nosniff" },\n        { key: "X-Frame-Options", value: "DENY" },\n        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },\n        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },\n      ],\n    }];\n  },
  transpilePackages: [
    "@azadimart/ui",
    "@azadimart/shared",
    "@azadimart/auth",
    "@azadimart/payments",
    "@azadimart/storage",
  ],
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
