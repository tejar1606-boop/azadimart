import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "@azadimart/ui/globals.css";
import MobileTabBar from "./components/mobile-tab-bar";
import SiteFooter from "./components/site-footer";
import SiteHeader from "./components/site-header";
import { getStoreChrome } from "./lib/chrome";
import { SITE_NAME, SITE_URL } from "./lib/seo";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  // Makes canonical and preview-image URLs absolute.
  metadataBase: new URL(SITE_URL),
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
    siteName: SITE_NAME,
    locale: "en_IN",
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  formatDetection: { telephone: false },
  twitter: {
    card: "summary_large_image",
    title: "AzadiMart — One trusted Indian marketplace",
    description:
      "A modern Indian marketplace built around verified sellers and a trustworthy customer experience.",
  },
};

// Rendered per request: the Content-Security-Policy nonce is new on every response.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b2a5b",
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