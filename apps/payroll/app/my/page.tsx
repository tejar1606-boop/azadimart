import { requireViewer } from "../lib/access";
import MyPayslips from "./my-payslips";

export const metadata = { title: "My payslips" };

export default async function MyPage() {
  const { viewer } = await requireViewer("employee");
  return <MyPayslips name={viewer.name} />;
}
