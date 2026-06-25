import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { verifyMockCredentials } from "../../../mock-data";
import { auditService } from "@/infrastructure/audit/db-audit-logger";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  // AUTH_SECRET is NextAuth v5's preferred env var; NEXTAUTH_SECRET is the v4 name.
  // || (not ??) is intentional: rejects empty strings and whitespace-only values.
  secret: process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim() || "demo-dev-secret-do-not-use-in-production",
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      async authorize(credentials, request) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const ipAddress = request?.headers?.get("x-forwarded-for")?.split(",")[0].trim()
          ?? request?.headers?.get("x-real-ip")
          ?? undefined;
        const userAgent = request?.headers?.get("user-agent") ?? undefined;

        const user = verifyMockCredentials(parsed.data.email, parsed.data.password);

        if (!user) {
          // Fire-and-forget — never block the auth response
          void auditService.logEvent(
            "AUTH_LOGIN_FAILURE",
            { method: "credentials", reason: "Invalid credentials", email: parsed.data.email },
            { resourceType: "User", success: false, errorCode: "INVALID_CREDENTIALS", ipAddress, userAgent },
          );
          return null;
        }

        void auditService.logEvent(
          "AUTH_LOGIN_SUCCESS",
          { method: "credentials" },
          { userId: user.id, resourceType: "User", resourceId: user.id, ipAddress, userAgent },
        );

        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET! })]
      : []),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as { role: string }).role = token.role as string;
      }
      return session;
    },
  },
});
