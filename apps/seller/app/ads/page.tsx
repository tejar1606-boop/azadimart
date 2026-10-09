import { PortalPageHeader } from "@azadimart/ui";
import AdsView from "./ads-view";

export const metadata = { title: "Advertise" };

export default function AdsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <PortalPageHeader eyebrow="Grow sales" title="Advertise on AzadiMart" description="Put your product on the home page banner. Bid for the days you want, or book instantly." />
      <AdsView />
    </main>
  );
}
