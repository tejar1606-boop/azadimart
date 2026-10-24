import { requireStaffPage } from "../lib/staff-page";
import LiveConsole from "./live-console";

export const metadata = { title: "Live chat" };
export const dynamic = "force-dynamic";

export default async function LiveChatPage() {
  const { access } = await requireStaffPage("livechat");
  return <LiveConsole meId={access.userId} />;
}
