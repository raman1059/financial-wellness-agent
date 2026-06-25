import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/infrastructure/db/prisma/client";
import { signIn } from "@/lib/auth/auth.config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
        <p className="mt-1 text-sm text-gray-500">Start managing your finances with AI</p>
      </div>

      <form
        action={async (formData: FormData) => {
          "use server";
          const email = formData.get("email") as string;
          const name = formData.get("name") as string;
          const password = formData.get("password") as string;

          if (!email || !name || !password || password.length < 6) {
            redirect("/register?error=invalid");
          }

          const existing = await prisma.user.findUnique({ where: { email } });
          if (existing) redirect("/register?error=exists");

          // Mock store: passwordHash field is mapped to passwordPlain in mock-data.ts
          const user = await prisma.user.create({
            data: { email, name, passwordHash: password, role: "USER" },
          });

          await prisma.employee.create({ data: { userId: user.id } });

          await signIn("credentials", { email, password, redirectTo: "/dashboard" });
        }}
        className="space-y-4"
      >
        <Input id="name" name="name" type="text" label="Full name" placeholder="Arpit Tiwari" required />
        <Input id="email" name="email" type="email" label="Email address" placeholder="you@example.com" required />
        <Input id="password" name="password" type="password" label="Password" placeholder="Min. 6 characters" required minLength={6} />

        <Button type="submit" className="w-full mt-2" size="lg">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Sign in
        </Link>
      </p>
    </div>
  );
}
