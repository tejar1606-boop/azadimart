import { requireViewer } from "../../lib/access";
import EmployeeForm from "../employee-form";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  await requireViewer("hr");
  return <EmployeeForm />;
}
