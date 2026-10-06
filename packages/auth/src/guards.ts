import {
  AppError,
  canAccessAudience,
  type AppAudience,
  type Role,
} from "@azadimart/shared";

export type SessionPrincipal = {
  userId: string;
  role: Role;
  customerId?: string;
  sellerId?: string;
};

export function requireSession(principal: SessionPrincipal | null): SessionPrincipal {
  if (!principal) {
    throw new AppError("UNAUTHORIZED", "Authentication required");
  }
  return principal;
}

export function requireRole(principal: SessionPrincipal | null, roles: Role[]): SessionPrincipal {
  const session = requireSession(principal);
  if (!roles.includes(session.role)) {
    throw new AppError("FORBIDDEN", "Insufficient role");
  }
  return session;
}

export function requireAudience(principal: SessionPrincipal | null, audience: AppAudience): SessionPrincipal {
  const session = requireSession(principal);
  if (!canAccessAudience(session.role, audience)) {
    throw new AppError("FORBIDDEN", "This identity cannot access this application");
  }
  return session;
}

export function requireSellerScope(principal: SessionPrincipal, resourceSellerId: string): void {
  if (principal.role !== "SELLER" || !principal.sellerId) {
    throw new AppError("FORBIDDEN", "Seller scope required");
  }
  if (principal.sellerId !== resourceSellerId) {
    throw new AppError("TENANT_ISOLATION", "Sellers cannot access another seller's data");
  }
}

export function denyCrossApp(principal: SessionPrincipal, audience: AppAudience): void {
  requireAudience(principal, audience);
}
