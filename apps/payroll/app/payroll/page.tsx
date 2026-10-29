import { requireViewer } from "../lib/access";
import RunsView from "./runs-view";

export const metadata = { title: "Monthly payroll" };

export default async function PayrollPage() {
  await requireViewer("hr");
  return <RunsView />;
}
