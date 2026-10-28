import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/actions/auth-actions";
import { DashboardShell } from "@/components/dashboard-shell";

const NAV = [
  { href: "/aios", label: "Command Center", section: "Founder" },
  { href: "/aios/copilot", label: "JARVIS" },
  { href: "/aios/projects", label: "Projects" },
  { href: "/aios/customers", label: "Customers", section: "Business" },
  { href: "/aios/organizations", label: "Organizations" },
  { href: "/aios/billing", label: "Billing" },
  { href: "/aios/operations", label: "Operations" },
  { href: "/aios/creatives", label: "Creative pipeline" },
  { href: "/aios/meta-intelligence", label: "Meta Intelligence", section: "Platform" },
  { href: "/aios/meta-check", label: "Live Meta check" },
  { href: "/aios/setup", label: "Setup check" },
  { href: "/aios/activity", label: "Activity log" },
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
