export type UserRole = "ADMIN" | "USER" | "ACCOUNTANT";

/**
 * Actions follow the pattern  resource:verb[:scope]
 *   :own  — actor may only touch resources they own
 *   :any  — actor may touch resources owned by anyone
 *   (no scope suffix) — not resource-scoped (e.g. chat:use, users:manage)
 */
export type Action =
  // Payroll
  | "payroll:read:own"
  | "payroll:read:any"
  | "payroll:write:own"
  | "payroll:write:any"
  | "payroll:delete:own"
  | "payroll:delete:any"
  // Documents
  | "documents:read:own"
  | "documents:read:any"
  | "documents:write:own"
  | "documents:delete:own"
  // Tax
  | "tax:read:own"
  | "tax:read:any"
  | "tax:simulate"
  // Chat
  | "chat:use"
  // Admin
  | "audit:read"
  | "users:manage";

const permissions: Record<UserRole, Action[]> = {
  USER: [
    "payroll:read:own",
    "payroll:write:own",
    "documents:read:own",
    "documents:write:own",
    "tax:read:own",
    "tax:simulate",
    "chat:use",
  ],
  ACCOUNTANT: [
    "payroll:read:own",
    "payroll:read:any",
    "documents:read:own",
    "documents:read:any",
    "tax:read:own",
    "tax:read:any",
    "audit:read",
  ],
  ADMIN: [
    "payroll:read:own",
    "payroll:read:any",
    "payroll:write:own",
    "payroll:write:any",
    "payroll:delete:own",
    "payroll:delete:any",
    "documents:read:own",
    "documents:read:any",
    "documents:write:own",
    "documents:delete:own",
    "tax:read:own",
    "tax:read:any",
    "tax:simulate",
    "chat:use",
    "audit:read",
    "users:manage",
  ],
};

export function can(role: UserRole, action: Action): boolean {
  return permissions[role]?.includes(action) ?? false;
}

/** True if the role can access resources belonging to other users. */
export function canAccessAny(role: UserRole): boolean {
  return role === "ADMIN" || role === "ACCOUNTANT";
}
