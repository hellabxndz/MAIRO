import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/auth-actions";

const NAV = [
  { href: "/aios", label: "Overview" },
  { href: "/aios/organizations", label: "Organizations" },
  { href: "/aios/creatives", label: "Creative pipeline" },
  { href: "/aios/copilot", label: "Copilot" },
];

export default async function AiosLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "OWNER") redirect("/sign-in");

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 p-6">
        <Link href="/" className="mb-1 text-lg font-semibold">
          MyRo
        </Link>
        <p className="mb-8 text-sm text-neutral-500">AIOS · Owner</p>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm text-neutral-300 hover:bg-white/5 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-500 hover:bg-white/5 hover:text-white"
          >
            Sign out
          </button>
        </form>
      </aside>

      <main className="flex-1 overflow-y-auto px-10 py-10">{children}</main>
    </div>
  );
}
