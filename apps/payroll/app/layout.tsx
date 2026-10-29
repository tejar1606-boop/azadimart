import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { createDatabase } from "@azadimart/database";
import "@azadimart/ui/globals.css";
import PayrollChrome, { type PayrollMe } from "./payroll-chrome";
import { currentViewer } from "./lib/access";

const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "LOIMART Payroll", template: "%s · LOIMART Payroll" },
  description: "LOIMART employee payroll and payslips",
  robots: { index: false, follow: false },
};

async function me(): Promise<PayrollMe | null> {
  try {
    const viewer = await currentViewer(createDatabase());
    if (!viewer) return null;
    return {
      name: viewer.name, isHr: Boolean(viewer.hr), isEmployee: Boolean(viewer.employeeId),
      adminUrl: (process.env.AUTH_URL_ADMIN ?? "").replace(/\/$/, ""),
      canUseAdmin: Boolean(viewer.hr?.permissions.some((p) => p !== "payroll")),
    };
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-screen bg-panel font-sans text-slate-950 antialiased">
        <PayrollChrome me={await me()}>{children}</PayrollChrome>
      </body>
    </html>
  );
}
