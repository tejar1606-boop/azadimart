import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "@azadimart/ui/globals.css";
import MobileTabBar from "./components/mobile-tab-bar";
import SiteFooter from "./components/site-footer";
import SiteHeader from "./components/site-header";
import { getStoreChrome } from "./lib/chrome";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "AzadiMart — One trusted Indian marketplace",
    template: "%s | AzadiMart",
  },
  description:
    "Discover products from verified Indian sellers across farming, fashion, home, beauty and more.",
  applicationName: "AzadiMart",
  keywords: ["AzadiMart", "Indian marketplace", "verified sellers", "made in India", "online shopping"],
  openGraph: {
    title: "AzadiMart — One trusted Indian marketplace",
    description:
      "A modern Indian marketplace built around verified sellers and a trustworthy customer experience.",
    type: "website",
    siteName: "AzadiMart",
  },
  twitter: {
    card: "summary_large_image",
    title: "AzadiMart — One trusted Indian marketplace",
    description:
      "A modern Indian marketplace built around verified sellers and a trustworthy customer experience.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const chrome = await getStoreChrome();
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen bg-canvas font-sans text-slate-950 antialiased">
        <SiteHeader chrome={chrome} />
        {children}
        <SiteFooter chrome={chrome} />
        <MobileTabBar />
      </body>
    </html>
  );
}