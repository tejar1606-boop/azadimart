import { SupportTicketView } from "@azadimart/ui";

export const metadata = { title: "Support request" };

export default async function SellerTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  return (
    <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <SupportTicketView apiBase="/api/v1/support" ticketId={ticketId} backHref="/help" teamName="AzadiMart seller support" />
      </div>
    </main>
  );
}
