import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth.config";
import { can, type Action, type UserRole } from "@/lib/auth/rbac";
import { auditService } from "@/infrastructure/audit/db-audit-logger";

export interface AuthContext {
  userId: string;
  role: UserRole;
}

type RouteParams = { params: Promise<Record<string, string>> };
type Handler = (req: NextRequest, ctx: RouteParams, auth: AuthContext) => Promise<Response>;

/**
 * Wraps a route handler with JWT validation.
 * Injects { userId, role } as a third argument.
 * Returns 401 if no valid session exists.
 */
export function withAuth(handler: Handler) {
  return async (req: NextRequest, ctx: RouteParams): Promise<Response> => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const authCtx: AuthContext = {
      userId: session.user.id,
      role: (session.user as { role: UserRole }).role ?? "USER",
    };
    return handler(req, ctx, authCtx);
  };
}

/**
 * Wraps a route handler requiring a specific RBAC permission.
 * Returns 403 if the caller's role does not hold the permission.
 * Logs the denial to the audit trail.
 */
export function withPermission(action: Action, handler: Handler) {
  return withAuth(async (req, ctx, authCtx) => {
    if (!can(authCtx.role, action)) {
      await auditService.log({
        userId: authCtx.userId,
        action: "PERMISSION_DENIED",
        resourceType: "Api",
        resourceId: new URL(req.url).pathname,
        metadata: { requiredPermission: action, callerRole: authCtx.role },
        success: false,
        errorCode: "FORBIDDEN",
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(req, ctx, authCtx);
  });
}

/**
 * Wraps a route handler restricted to specific roles.
 * Returns 403 if the caller's role is not in the allowlist.
 */
export function withRoles(roles: UserRole[], handler: Handler) {
  return withAuth(async (req, ctx, authCtx) => {
    if (!roles.includes(authCtx.role)) {
      await auditService.log({
        userId: authCtx.userId,
        action: "PERMISSION_DENIED",
        resourceType: "Api",
        resourceId: new URL(req.url).pathname,
        metadata: { requiredRoles: roles, callerRole: authCtx.role },
        success: false,
        errorCode: "FORBIDDEN",
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return handler(req, ctx, authCtx);
  });
}
