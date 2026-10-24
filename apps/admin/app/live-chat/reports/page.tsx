import { requireStaffPage } from "../../lib/staff-page";
import ChatReports from "./chat-reports";

export const metadata = { title: "Live chat reports" };
export const dynamic = "force-dynamic";

export default async function LiveChatReportsPage() {
  await requireStaffPage("livechat");
  return <ChatReports />;
}
