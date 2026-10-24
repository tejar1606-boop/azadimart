import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { createDatabase } from "@azadimart/database";
import "@azadimart/ui/globals.css";
import StudioChrome, { type StudioMe } from "./studio-chrome";
import { currentStudioUser, pendingAdCount } from "./lib/staff";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "LOIMART Banner Studio", template: "%s · LOIMART Banner Studio" },
  description: "Upload, schedule and publish LOIMART store banners",
  robots: { index: false, follow: false },
};

async function me(): Promise<StudioMe | null> {
  try {
    const db = createDatabase();
    const access = await currentStudioUser(db);
    if (!access) return null;
    return {
      name: access.displayName ?? "Team member",
      roleName: access.roleName,
      pendingAds: await pendingAdCount(db),
      storefrontUrl: (process.env.AUTH_URL_STOREFRONT ?? "").replace(/\/$/, "") || "/",
      adminUrl: (process.env.AUTH_URL_ADMIN ?? "").replace(/\/$/, ""),
      canUseAdmin: access.permissions.some((p) => p !== "banners"),
    };
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen bg-panel font-sans text-slate-950 antialiased">
        <StudioChrome me={await me()}>{children}</StudioChrome>
      </body>
    </html>
  );
}
