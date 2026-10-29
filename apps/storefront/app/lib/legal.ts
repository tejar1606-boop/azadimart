/**
 * Company and contact details used on the Terms and Privacy pages. Set the
 * NEXT_PUBLIC_LEGAL_* values once the company is registered (Vercel / .env);
 * until then the brand name and support contacts are shown.
 *
 * The Consumer Protection (E-Commerce) Rules, 2020 require the legal name,
 * address, customer care contact and a Grievance Officer (name, designation,
 * contact) to be shown on the platform.
 */
export const LEGAL = {
  brand: "LOIMART",
  companyName: process.env.NEXT_PUBLIC_LEGAL_NAME || "LOIMART",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "",
  gstin: process.env.NEXT_PUBLIC_LEGAL_GSTIN || "",
  website: process.env.NEXT_PUBLIC_SITE_URL || "https://loimart.com",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE || "",
  grievanceOfficer: {
    name: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME || "Surisetty Raviteja",
    designation: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_TITLE || "CEO & Director",
    email: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "",
  },
  jurisdiction: process.env.NEXT_PUBLIC_LEGAL_JURISDICTION || "Hyderabad, Telangana",
  /** Shown as "Last updated" on both pages. Change when the text changes. */
  updatedOn: "19 October 2026",
  returnWindowDays: Number(process.env.RETURN_WINDOW_DAYS ?? 7) || 7,
} as const;
