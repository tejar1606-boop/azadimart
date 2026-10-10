import type { ReactNode } from "react";
import { ComingSoon, type PortalIconName, PortalPageHeader } from "@azadimart/ui";

/** What each planned (not yet built) admin section will cover. */
const PLANNED: Record<string, { icon: PortalIconName; points: string[] }> = {
  Customers: { icon: "customers", points: ["Search customers", "Order history", "Addresses", "Account status"] },
  Finance: { icon: "finance", points: ["Seller payouts", "Commission & fees", "Refund ledger", "Settlement reports"] },
  Returns: { icon: "returns", points: ["Return requests", "Pickup tracking", "Refund approval", "Seller disputes"] },
  Support: { icon: "support", points: ["Customer tickets", "Seller tickets", "SLAs", "Order-linked conversations"] },
  Marketing: { icon: "marketing", points: ["Campaigns", "Banners", "Push & email", "Performance"] },
  "Security & Audit": { icon: "security", points: ["Audit log viewer", "Admin users & roles", "Login attempts", "Active sessions"] },
};

export function AdminScreen({
  title,
  description,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const planned = PLANNED[title];
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />
      <div className="mt-6">
        {children ?? <ComingSoon title={`${title} is on the way`} description={description} icon={planned?.icon} points={planned?.points} />}
      </div>
    </main>
  );
}
