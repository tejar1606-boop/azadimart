import { AdminScreen } from "../_components/admin-screen";

export default function Page() {
  return (
    <AdminScreen
      title="Security & Audit"
      description="Every admin mutation writes an audit_logs row. SUPER_ADMIN can manage ADMIN users."
    />
  );
}
