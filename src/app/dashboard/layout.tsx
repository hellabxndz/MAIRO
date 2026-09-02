import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { signOutAction } from "@/lib/actions/auth-actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { isExploring } from "@/lib/explore-mode";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/plan", label: "Monthly plan" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/creatives", label: "Creatives" },
  { href: "/dashboard/meta", label: "Meta connection" },
  { href: "/dashboard/agents", label: "AI specialists" },
  { href: "/dashboard/settings", label: "Settings" },
];

// Pages the not-yet-connected client can still open.
//
// /dashboard/meta is the obvious one — it is where the funnel sends them and
// there has to be somewhere to land. Settings is the less obvious one, and
// leaving it out was a trap: someone who mistyped their business name at
// signup is by definition someone who has not connected an ad account yet, so
// gating the only screen that fixes it behind connecting one leaves them stuck
// with a name the AI will put in every ad it writes.
const ALWAYS_REACHABLE = ["/dashboard/meta", "/dashboard/settings"];

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
  //
  // "Explore first" is the one way past the Meta step, and it is deliberate:
  // the visitor has to click it, every page then carries a banner saying the
  // account is not connected, and nothing that would actually spend money
  // works until it is. Without it, anyone Meta hasn't approved as a tester
  // cannot see past this screen at all.
  const exploring = await isExploring();
  if (!intake) redirect("/onboarding");
  if (!metaAccount && !exploring && !ALWAYS_REACHABLE.some((p) => pathname.startsWith(p))) {
    redirect("/dashboard/meta?required=1");
  }

  return (
    <DashboardShell
      navItems={NAV}
      brandLabel="MAIRO"
      subtitle={organization?.name}
      onSignOut={signOutAction}
    >
      {!metaAccount && (
        <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-200">
            You&apos;re looking around without a Meta account connected. Plans and
            creatives work, but nothing can go live until you connect one.
          </p>
          <Link
            href="/dashboard/meta"
            className="shrink-0 rounded-lg border border-amber-400/40 px-4 py-2 text-xs uppercase tracking-[0.1em] text-amber-100 transition hover:bg-amber-400 hover:text-black"
          >
            Connect Meta
          </Link>
        </div>
      )}
      {children}
    </DashboardShell>
  );
}
