import type { Metadata } from "next";
import "@azadimart/ui/globals.css";

export const metadata: Metadata = {
  title: "AzadiMart",
  description: "Indian multi-vendor marketplace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
