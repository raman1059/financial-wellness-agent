import { auth } from "@/lib/auth/auth.config";
import { signOut } from "@/lib/auth/auth.config";
import { LogOut, Bell } from "lucide-react";

export async function Header() {
  const session = await auth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <button className="relative rounded-full p-1.5 text-gray-400 hover:text-gray-600">
          <Bell className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-semibold">
            {session?.user?.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900">{session?.user?.name ?? "User"}</p>
            <p className="text-xs text-gray-500">{session?.user?.email}</p>
          </div>
        </div>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600">
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </div>
    </header>
  );
}
