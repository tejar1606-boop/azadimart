import type { Metadata, Viewport } from "next";
import "@azadimart/ui/globals.css";

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
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}