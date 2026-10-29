import { requireViewer } from "../../lib/access";
import EmployeeForm from "../employee-form";

export const metadata = { title: "Employee" };

export default async function EmployeePage({ params }: { params: Promise<{ employeeId: string }> }) {
  await requireViewer("hr");
  return <EmployeeForm employeeId={(await params).employeeId} />;
}
