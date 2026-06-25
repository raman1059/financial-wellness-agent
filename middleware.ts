import { auth } from "@/lib/auth/auth.config";
import { NextResponse } from "next/server";
import type { UserRole } from "@/lib/auth/rbac";

const PROTECTED   = ["/dashboard", "/payroll", "/documents", "/tax", "/chat"];
const ADMIN_ONLY  = ["/admin"];
const AUTH_PAGES  = ["/login", "/register"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session    = req.auth;
  const isLoggedIn = !!session?.user?.id;
  const role       = (session?.user as { role?: UserRole } | undefined)?.role;

  // Unauthenticated user hitting a protected route → send to login
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p));
  if (isProtected && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Non-admin hitting an admin-only route → redirect to dashboard
  const isAdminOnly = ADMIN_ONLY.some((p) => pathname.startsWith(p));
  if (isAdminOnly) {
    if (!isLoggedIn) return NextResponse.redirect(new URL("/login", req.url));
    if (role !== "ADMIN") return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Authenticated user hitting auth pages → send to dashboard
  const isAuthPage = AUTH_PAGES.some((p) => pathname.startsWith(p));
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
