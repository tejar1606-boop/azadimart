import { redirect } from "next/navigation";
import { requireViewer } from "./lib/access";

export default async function Home() {
  const { viewer } = await requireViewer();
  redirect(viewer.hr ? "/payroll" : "/my");
}
