import { z } from "zod";

export const apiContractMetaSchema = z.object({
  method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
  path: z.string().startsWith("/api/"),
  audience: z.enum(["storefront", "seller", "admin"]),
  auth: z.enum(["none", "session"]),
  roles: z.array(z.enum(["CUSTOMER", "SELLER", "ADMIN", "SUPER_ADMIN"])),
});

export type ApiContract = z.infer<typeof apiContractMetaSchema> & {
  description: string;
};

export const API_CONTRACTS: ApiContract[] = [
  {
    method: "GET",
    path: "/api/health",
    audience: "storefront",
    auth: "none",
    roles: [],
    description: "Storefront health check",
  },
  {
    method: "GET",
    path: "/api/health",
    audience: "seller",
    auth: "none",
    roles: [],
    description: "Seller health check",
  },
  {
    method: "GET",
    path: "/api/health",
    audience: "admin",
    auth: "none",
    roles: [],
    description: "Admin health check",
  },
  {
    method: "GET",
    path: "/api/v1/catalog/products",
    audience: "storefront",
    auth: "none",
    roles: [],
    description: "Public catalog listing of live products only",
  },
  {
    method: "GET",
    path: "/api/v1/cart",
    audience: "storefront",
    auth: "session",
    roles: ["CUSTOMER"],
    description: "Customer cart",
  },
  {
    method: "POST",
    path: "/api/v1/products",
    audience: "seller",
    auth: "session",
    roles: ["SELLER"],
    description: "Create product draft scoped to the authenticated seller",
  },
  {
    method: "POST",
    path: "/api/v1/qc-submissions",
    audience: "seller",
    auth: "session",
    roles: ["SELLER"],
    description: "Submit seller-owned product for QC",
  },
  {
    method: "GET",
    path: "/api/v1/sellers",
    audience: "admin",
    auth: "session",
    roles: ["ADMIN", "SUPER_ADMIN"],
    description: "List sellers for onboarding and approval",
  },
  {
    method: "POST",
    path: "/api/v1/qc",
    audience: "admin",
    auth: "session",
    roles: ["ADMIN", "SUPER_ADMIN"],
    description: "Approve or reject a QC submission",
  },
  {
    method: "GET",
    path: "/api/v1/themes",
    audience: "admin",
    auth: "session",
    roles: ["ADMIN", "SUPER_ADMIN"],
    description: "Theme drafts, published theme, and revision history",
  },
];

export function contractsForAudience(audience: ApiContract["audience"]): ApiContract[] {
  return API_CONTRACTS.filter((contract) => contract.audience === audience);
}
