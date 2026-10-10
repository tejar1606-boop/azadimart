import OrdersList from "./orders-list";
import { AdminScreen } from "../_components/admin-screen";

export default function Page() {
  return (
    <AdminScreen
      title="Orders"
      description="Cross-seller order operations. Sellers only see their own order items."
    >
      <OrdersList />
    </AdminScreen>
  );
}
