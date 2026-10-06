export const ROLES = ["CUSTOMER", "SELLER", "ADMIN", "SUPER_ADMIN"] as const;

export type Role = (typeof ROLES)[number];

export const APP_AUDIENCES = ["storefront", "seller", "admin"] as const;

export type AppAudience = (typeof APP_AUDIENCES)[number];

export const ROLE_AUDIENCE: Record<Role, AppAudience> = {
  CUSTOMER: "storefront",
  SELLER: "seller",
  ADMIN: "admin",
  SUPER_ADMIN: "admin",
};

export const PRIVILEGED_ROLES: readonly Role[] = ["ADMIN", "SUPER_ADMIN"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function canAccessAudience(role: Role, audience: AppAudience): boolean {
  return ROLE_AUDIENCE[role] === audience;
}

export function isPrivileged(role: Role): boolean {
  return PRIVILEGED_ROLES.includes(role);
}
