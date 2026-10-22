import { requireViewer } from "../lib/access";
import EmployeesView from "./employees-view";

export const metadata = { title: "Employees" };

export default async function EmployeesPage() {
  await requireViewer("hr");
  return <EmployeesView />;
}
