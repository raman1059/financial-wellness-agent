export type UserRole = "ADMIN" | "USER" | "ACCOUNTANT";

type Action =
  | "payroll:read"
  | "payroll:write"
  | "payroll:delete"
  | "documents:read"
  | "documents:write"
  | "documents:delete"
  | "tax:read"
  | "tax:write"
  | "chat:use"
  | "audit:read"
  | "users:manage";

const permissions: Record<UserRole, Action[]> = {
  ADMIN: [
    "payroll:read", "payroll:write", "payroll:delete",
    "documents:read", "documents:write", "documents:delete",
    "tax:read", "tax:write",
    "chat:use",
    "audit:read",
    "users:manage",
  ],
  USER: [
    "payroll:read", "payroll:write",
    "documents:read", "documents:write",
    "tax:read", "tax:write",
    "chat:use",
  ],
  ACCOUNTANT: [
    "payroll:read",
    "documents:read",
    "tax:read",
    "audit:read",
  ],
};

export function can(role: UserRole, action: Action): boolean {
  return permissions[role]?.includes(action) ?? false;
}
