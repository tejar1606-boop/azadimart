import { AdminScreen } from "../_components/admin-screen";
import ShipmentList from "./shipment-list";

export default function Page() {
  return (
    <AdminScreen
      title="Logistics"
      description="Provider-agnostic shipment operations. Shiprocket, Delhivery, and Shadowfax plug in behind @azadimart/logistics."
    >
      <ShipmentList />
    </AdminScreen>
  );
}
