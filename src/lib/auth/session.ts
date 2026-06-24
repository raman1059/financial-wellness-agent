import { auth } from "./auth.config";
import { redirect } from "next/navigation";

export interface AppSession {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    role: string;
  };
}

export async function getSession(): Promise<AppSession | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session as AppSession;
}

export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(role: string): Promise<AppSession> {
  const session = await requireSession();
  if (session.user.role !== role && session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return session;
}
