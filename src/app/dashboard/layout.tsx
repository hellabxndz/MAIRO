import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { signOutAction } from "@/lib/actions/auth-actions";
import { DashboardShell } from "@/components/dashboard-shell";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/plan", label: "Monthly plan" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/creatives", label: "Creatives" },
  { href: "/dashboard/meta", label: "Meta connection" },
  { href: "/dashboard/agents", label: "AI specialists" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = session.user.organizationId;

  const pathname = (await headers()).get("x-pathname") ?? "";

  const [organization, intake, metaAccount] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { id: true } }),
  ]);

  // Enforce the intended funnel: sign up -> onboarding -> connect Meta ->
  // rest of the dashboard. /dashboard/meta itself is exempt from the second
  // check so there's somewhere for a not-yet-connected client to land.
  if (!intake) redirect("/onboarding");
  if (!metaAccount && !pathname.startsWith("/dashboard/meta")) {
    redirect("/dashboard/meta?required=1");
  }

  return (
    <DashboardShell
      navItems={NAV}
      brandLabel="MAIRO"
      subtitle={organization?.name}
      onSignOut={signOutAction}
    >
      {children}
    </DashboardShell>
  );
}
