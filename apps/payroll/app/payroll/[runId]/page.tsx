import { requireViewer } from "../../lib/access";
import RunView from "./run-view";

export const metadata = { title: "Payroll month" };

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  await requireViewer("hr");
  return <RunView runId={(await params).runId} />;
}
