import { AdminScreen } from "../_components/admin-screen";

export default function Page() {
  return (
    <AdminScreen
      title="Dashboard"
      description="Operational snapshot for orders, sellers awaiting approval, QC queue, and payouts."
    />
  );
}
