import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/auth-actions";
import { DashboardShell } from "@/components/dashboard-shell";

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
    <DashboardShell navItems={NAV} brandLabel="MAIRO" subtitle="AIOS · Owner" onSignOut={signOutAction}>
      {children}
    </DashboardShell>
  );
}
