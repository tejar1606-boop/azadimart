import { SupportTicketView } from "@azadimart/ui";
import { requireCustomerPage } from "../session";

export const metadata = { title: "Support request", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  await requireCustomerPage(`/account/support/${ticketId}`);
  return (
    <main className="min-h-[60vh] bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <SupportTicketView apiBase="/api/v1/support" ticketId={ticketId} backHref="/account/support" />
      </div>
    </main>
  );
}
