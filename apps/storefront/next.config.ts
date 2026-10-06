import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@azadimart/ui",
    "@azadimart/shared",
    "@azadimart/auth",
    "@azadimart/payments",
    "@azadimart/storage",
  ],
};

export default nextConfig;
