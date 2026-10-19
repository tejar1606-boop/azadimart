import { z } from "zod";

/**
 * Team access in the admin portal. Each team member has one role; a role is a
 * set of areas (permissions). The owner (SUPER_ADMIN) and existing full
 * admins have every area. Every admin API checks its area on the server.
 */
export const STAFF_PERMISSIONS = {
  dashboard: { label: "Dashboard", description: "Sales overview and work queues" },
  orders: { label: "Orders & customers", description: "Orders, cancellations, returns, abandoned carts, customers" },
  payments: { label: "Payments & finance", description: "Payments, refunds, finance and seller payouts" },
  catalog: { label: "Catalogue & quality", description: "Products, categories, approvals, quality check, A+ content, reviews" },
  sellers: { label: "Sellers & KYC", description: "Seller approval, KYC documents, bank verification, payout holds" },
  storefront: { label: "Online store", description: "Home page layout, menus, category photos" },
  marketing: { label: "Marketing", description: "Coupons, offer tags, seller ads" },
  logistics: { label: "Logistics", description: "Shipments and couriers" },
  support: { label: "Support desk", description: "Customer and seller support requests" },
  livechat: { label: "Live chat", description: "Chat in real time with shoppers and sellers" },
  security: { label: "Security & audit", description: "Audit log and security settings" },
  team: { label: "Team & roles", description: "Add team members, assign roles, edit roles" },
  banners: { label: "Banner Studio", description: "Home page banners, page banners and seller ad approvals (separate Banner Studio app)" },
} as const;
export type StaffPermission = keyof typeof STAFF_PERMISSIONS;
export const STAFF_PERMISSION_KEYS = Object.keys(STAFF_PERMISSIONS) as StaffPermission[];
export const isStaffPermission = (v: unknown): v is StaffPermission => typeof v === "string" && v in STAFF_PERMISSIONS;

/** Ready-made roles, created on first use; they can be edited (not deleted). */
export const DEFAULT_STAFF_ROLES: Array<{ name: string; description: string; permissions: StaffPermission[] }> = [
  { name: "Admin", description: "Everything, including the team", permissions: [...STAFF_PERMISSION_KEYS] },
  { name: "Operations", description: "Day-to-day orders, shipping and support", permissions: ["dashboard", "orders", "logistics", "support", "livechat"] },
  { name: "Catalogue & QC", description: "Checks and manages products", permissions: ["dashboard", "catalog"] },
  { name: "Seller onboarding", description: "Approves sellers and their KYC", permissions: ["dashboard", "sellers", "support"] },
  { name: "Finance", description: "Payments, refunds and seller payouts", permissions: ["dashboard", "payments", "orders"] },
  { name: "Marketing", description: "Store design, banners, coupons and ads", permissions: ["dashboard", "storefront", "marketing", "banners"] },
  { name: "Banner team", description: "Only the Banner Studio: upload and schedule banners, approve seller ads", permissions: ["banners"] },
  { name: "Support agent", description: "Answers customer and seller requests", permissions: ["support", "livechat"] },
];

/** Which area each admin page belongs to (longest matching prefix wins). */
export const ADMIN_PAGE_PERMISSIONS: Array<[string, StaffPermission]> = [
  ["/dashboard", "dashboard"],
  ["/orders", "orders"], ["/abandoned-carts", "orders"], ["/returns", "orders"], ["/customers", "orders"],
  ["/payments", "payments"], ["/finance", "payments"],
  ["/catalog", "catalog"], ["/products", "catalog"], ["/qc", "catalog"], ["/aplus", "catalog"], ["/reviews", "catalog"], ["/media", "catalog"],
  ["/sellers", "sellers"],
  ["/online-store", "storefront"],
  ["/marketing", "marketing"],
  ["/logistics", "logistics"],
  ["/support", "support"],
  ["/live-chat", "livechat"],
  ["/security", "security"],
  ["/team", "team"],
];
export function adminPagePermission(pathname: string): StaffPermission | null {
  const match = ADMIN_PAGE_PERMISSIONS.filter(([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/")).sort((a, b) => b[0].length - a[0].length)[0];
  return match ? match[1] : null;
}
/** Address of the separate Banner Studio app (banners moved out of Admin). */
export const STUDIO_URL = (process.env.NEXT_PUBLIC_STUDIO_URL || (process.env.NODE_ENV === "production" ? "https://banners.loimart.com" : "http://localhost:3003")).replace(/\/$/, "");
/** Where to send someone after sign-in: the first page they may open. */
export function firstAdminPage(permissions: readonly string[]): string {
  // Banner-team members have no Admin pages: send them to the Banner Studio.
  return ADMIN_PAGE_PERMISSIONS.find(([, p]) => permissions.includes(p))?.[0] ?? (permissions.includes("banners") ? STUDIO_URL : "/login");
}

const permissionList = z.array(z.enum(STAFF_PERMISSION_KEYS as [StaffPermission, ...StaffPermission[]])).min(1, "Choose at least one area").max(STAFF_PERMISSION_KEYS.length);
export const staffRoleSchema = z.object({
  name: z.string().trim().min(2, "Name the role").max(40),
  description: z.string().trim().max(160).optional().default(""),
  permissions: permissionList,
});
export const staffRoleUpdateSchema = staffRoleSchema.partial();
export const staffMemberCreateSchema = z.object({
  displayName: z.string().trim().min(2, "Add their name").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  roleId: z.string().uuid("Choose a role"),
});
export const staffMemberUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(60).optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(10, "Use at least 10 characters").max(200).optional(),
}).refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });
