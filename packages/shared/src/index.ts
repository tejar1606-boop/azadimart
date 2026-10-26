export * from "./roles";
export * from "./errors";
export * from "./logger";
export * from "./routes";
export * from "./api/index";
export * from "./validation/index";
export * from "./theme";
export * from "./seller-tax";
export * from "./aplus";
export * from "./settlement";
export * from "./ads";
export * from "./page-banners";
export * from "./support";
export * from "./staff";
export * from "./live-chat";
export * from "./coupon-allocation";
export * from "./bulk-products";
export * from "./variants";
export * from "./shipping-rates";
export * from "./return-deadlines";
export * from "./bulk-reviews";
export * from "./seller-wallet";

/**
 * A production build running as a private TEST server (e.g. this Mac behind a
 * tunnel): keeps test-only helpers (local file storage, on-screen OTP codes,
 * sandbox KYC) working. Set ALLOW_TEST_PROVIDERS=YES only on test machines;
 * it is ignored on the live hosted site.
 */
export const testProvidersAllowed = () => process.env.NODE_ENV !== "production" || (process.env.ALLOW_TEST_PROVIDERS === "YES" && process.env.VERCEL_ENV !== "production");
export * from "./price-changes";
export * from "./gst";
export * from "./payroll";
export * from "./footwear";
export * from "./customer-wallet";
export * from "./platform-fee";
export * from "./order-cashback";
export * from "./sales-report";
