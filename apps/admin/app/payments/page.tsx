import { getPaymentProviderReadiness } from "@azadimart/payments";
import { AdminScreen } from "../_components/admin-screen";

export default function Page() {
  const providers = getPaymentProviderReadiness();

  return (
    <AdminScreen
      title="Payments"
      description="Payment providers remain behind the shared @azadimart/payments abstraction."
    >
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {providers.map((provider) => (
          <section key={provider.code} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-black">{provider.code}</h2>
              <span className={provider.isConfigured ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" : "rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"}>
                {provider.isConfigured ? "Configured" : "Credentials pending"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {provider.isConfigured
                ? "This provider is available through the application payment abstraction."
                : "The adapter is intentionally unavailable until the provider configuration is supplied."}
            </p>
          </section>
        ))}
      </div>
    </AdminScreen>
  );
}
