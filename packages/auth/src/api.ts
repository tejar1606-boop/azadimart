import type { Database } from "@azadimart/database";
import type { AppAudience, Role } from "@azadimart/shared";
import { requireAudience, requireRole } from "./guards";
import { getSessionPrincipal } from "./session";

export async function requireApiAccess(
  request: Request,
  audience: AppAudience,
  roles: Role[],
  db?: Database,
) {
  const principal = await getSessionPrincipal(request, db);
  const session = requireAudience(principal, audience);
  return roles.length > 0 ? requireRole(session, roles) : session;
}
