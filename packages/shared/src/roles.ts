/** SUPPORT: a support-team agent; signs in to the admin portal but only works the Support desk.
 * EMPLOYEE: a LOIMART employee who only signs in to the Payroll app to see their own payslips. */
export const ROLES = ["CUSTOMER", "SELLER", "ADMIN", "SUPER_ADMIN", "SUPPORT", "EMPLOYEE"] as const;

export type Role = (typeof ROLES)[number];

export const APP_AUDIENCES = ["storefront", "seller", "admin", "payroll"] as const;

export type AppAudience = (typeof APP_AUDIENCES)[number];

export const ROLE_AUDIENCE: Record<Role, AppAudience> = {
  CUSTOMER: "storefront",
  SELLER: "seller",
  ADMIN: "admin",
  SUPER_ADMIN: "admin",
  SUPPORT: "admin",
  EMPLOYEE: "payroll",
};

export const PRIVILEGED_ROLES: readonly Role[] = ["ADMIN", "SUPER_ADMIN"];
/** Who may work support tickets in the admin portal. */
export const SUPPORT_DESK_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN", "SUPPORT"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function canAccessAudience(role: Role, audience: AppAudience): boolean {
  return ROLE_AUDIENCE[role] === audience;
}

export function isPrivileged(role: Role): boolean {
  return PRIVILEGED_ROLES.includes(role);
}
