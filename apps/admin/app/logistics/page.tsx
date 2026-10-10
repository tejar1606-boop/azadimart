import { getLogisticsProviderReadiness } from "@azadimart/logistics";
import { AdminScreen } from "../_components/admin-screen";
import ShipmentList from "./shipment-list";

export default function Page() {
  const providers = getLogisticsProviderReadiness();

  return (
    <AdminScreen
      title="Logistics"
      description="Carrier integrations stay behind @azadimart/logistics. Manual fulfillment is available for testing."
    >
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {providers.map((provider) => (
          <section key={provider.code} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-black">{provider.code}</h2>
              <span className={provider.isConfigured ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" : "rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"}>
                {provider.isConfigured ? "Ready" : "Pending"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {provider.isConfigured ? "Provider can be selected for seller fulfillment." : "Provider adapter will activate once its official API configuration is supplied."}
            </p>
          </section>
        ))}
      </div>
      <ShipmentList />
    </AdminScreen>
  );
}
