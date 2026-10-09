import { AppError } from "@azadimart/shared";

/**
 * Aadhaar OTP verification through a UIDAI-licensed provider. AzadiMart never
 * stores the Aadhaar number: it goes straight to the provider, which sends an
 * OTP to the Aadhaar-linked mobile and returns the holder's details.
 *
 *   AADHAAR_PROVIDER=cashfree  Cashfree Secure ID (Offline Aadhaar OTP);
 *                              needs CASHFREE_VERIFICATION_CLIENT_ID / _SECRET,
 *                              CASHFREE_VERIFICATION_ENV=production for live.
 *   AADHAAR_PROVIDER=sandbox   Test mode: OTP is always 123456. Refused on the
 *                              live site. Used automatically in development.
 */
export type AadhaarDetails = { name: string; yearOfBirth: string | null; state: string | null };
type Provider = {
  name: "cashfree" | "sandbox";
  sendOtp(aadhaarNumber: string): Promise<{ ref: string }>;
  verifyOtp(ref: string, otp: string): Promise<AadhaarDetails | null>;
};

export const SANDBOX_OTP = "123456";

const sandbox = (holderName: string): Provider => ({
  name: "sandbox",
  async sendOtp() { return { ref: "sandbox-" + crypto.randomUUID() }; },
  async verifyOtp(_ref, otp) { return otp === SANDBOX_OTP ? { name: holderName, yearOfBirth: null, state: null } : null; },
});

function cashfree(): Provider {
  const id = process.env.CASHFREE_VERIFICATION_CLIENT_ID, secret = process.env.CASHFREE_VERIFICATION_CLIENT_SECRET;
  if (!id || !secret) throw new AppError("UNPROCESSABLE", "Aadhaar verification isn't set up yet. Please try again later.");
  const base = process.env.CASHFREE_VERIFICATION_ENV === "production" ? "https://api.cashfree.com" : "https://sandbox.cashfree.com";
  const call = async (path: string, body: object) => {
    const response = await fetch(base + "/verification/offline-aadhaar/" + path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-client-id": id, "x-client-secret": secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (!response) throw new AppError("UNPROCESSABLE", "Couldn't reach the Aadhaar service. Please try again.");
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, json };
  };
  return {
    name: "cashfree",
    async sendOtp(aadhaarNumber) {
      const { ok, json } = await call("otp", { aadhaar_number: aadhaarNumber });
      if (!ok || !json.ref_id) throw new AppError("UNPROCESSABLE", typeof json.message === "string" ? json.message : "Couldn't send the OTP. Check the Aadhaar number and that a mobile number is linked to it.");
      return { ref: String(json.ref_id) };
    },
    async verifyOtp(ref, otp) {
      const { ok, json } = await call("verify", { ref_id: ref, otp });
      if (!ok || json.status !== "VALID" || typeof json.name !== "string") return null;
      const split = json.split_address as { state?: string } | undefined;
      const dob = typeof json.dob === "string" ? json.dob : "";
      return { name: json.name, yearOfBirth: typeof json.year_of_birth === "string" ? json.year_of_birth : dob.slice(-4) || null, state: split?.state ?? null };
    },
  };
}

/** The configured provider. Test mode is never allowed on the live site. */
export function aadhaarProvider(holderName: string): Provider {
  const chosen = process.env.AADHAAR_PROVIDER ?? (process.env.NODE_ENV === "production" ? "" : "sandbox");
  if (chosen === "cashfree") return cashfree();
  if (chosen === "sandbox" && process.env.VERCEL_ENV !== "production") return sandbox(holderName);
  throw new AppError("UNPROCESSABLE", "Aadhaar verification isn't set up yet. Please try again later.");
}
