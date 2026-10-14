import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "@azadimart/ui/globals.css";
import MobileTabBar from "./components/mobile-tab-bar";
import ScrollToTop from "./components/scroll-to-top";
import SiteFooter from "./components/site-footer";
import SiteHeader from "./components/site-header";
import { HelpChat } from "@azadimart/ui";
import { SUPPORT_CATEGORIES, supportCategoriesFor } from "@azadimart/shared";
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
    default: "LOIMART — One trusted Indian marketplace",
    template: "%s | LOIMART",
  },
  description:
    "Discover products from verified Indian sellers across farming, fashion, home, beauty and more.",
  applicationName: "LOIMART",
  keywords: ["LOIMART", "Indian marketplace", "verified sellers", "made in India", "online shopping"],
  openGraph: {
    title: "LOIMART — One trusted Indian marketplace",
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
    title: "LOIMART — One trusted Indian marketplace",
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
        <ScrollToTop />
        <SiteHeader chrome={chrome} />
        {children}
        <SiteFooter chrome={chrome} />
        <MobileTabBar />
        <HelpChat title="LOIMART Help" subtitle="Orders, returns, payments and products" apiBase="/api/v1/support" ticketsPath="/account/support" signInHref="/login"
          categories={supportCategoriesFor("CUSTOMER").map((key) => ({ key, label: SUPPORT_CATEGORIES[key].label }))} storageKey="azm-help" launcherClassName="bottom-24 lg:bottom-6" hideLauncherOn={["/checkout"]}
          live={{ apiBase: "/api/v1/live-chat", ticketsPath: "/account/support", storageKey: "azm-live-chat", topics: supportCategoriesFor("CUSTOMER").map((key) => ({ key, label: SUPPORT_CATEGORIES[key].label })) }} />
      </body>
    </html>
  );
}