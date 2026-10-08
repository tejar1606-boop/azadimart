import type { Metadata } from "next";
import "@azadimart/ui/globals.css";
import SellerNav from "./seller-nav";

export const metadata: Metadata = {
  title: "AzadiMart Seller",
  description: "Seller portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f8f7f3] antialiased">
        <SellerNav />
        {children}
      </body>
    </html>
  );
}
