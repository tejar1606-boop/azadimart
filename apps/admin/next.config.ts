import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@azadimart/ui", "@azadimart/shared", "@azadimart/auth"],
};

export default nextConfig;
