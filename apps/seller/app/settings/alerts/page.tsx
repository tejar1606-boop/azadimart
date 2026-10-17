import { PortalPageHeader } from "@azadimart/ui";
import AlertSettings from "./alert-settings";

export const metadata = { title: "Alerts & notifications" };

export default function AlertsPage() {
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Account" title="Alerts & notifications" description="Never miss an order. Choose what you're alerted about and turn on alerts for your phone or computer." />
      <AlertSettings vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
    </main>
  );
}
