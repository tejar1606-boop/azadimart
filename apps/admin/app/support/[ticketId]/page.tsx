import TicketWorkspace from "./ticket-workspace";

export const metadata = { title: "Support ticket" };

export default async function SupportTicketPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  return <TicketWorkspace ticketId={ticketId} />;
}
