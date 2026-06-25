import { auth } from "./auth.config";
import { redirect } from "next/navigation";
import { can, type Action, type UserRole } from "./rbac";

export interface AppSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    role: UserRole;
  };
}

export async function getSession(): Promise<AppSession | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session as unknown as AppSession;
}

export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Redirects non-admin users to /dashboard if they lack the required role. */
export async function requireRole(...roles: UserRole[]): Promise<AppSession> {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) redirect("/dashboard");
  return session;
}

/** Returns true if the session user has the given RBAC permission. */
export async function sessionCan(action: Action): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;
  return can(session.user.role, action);
}
