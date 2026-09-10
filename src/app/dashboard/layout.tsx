import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { signOutAction } from "@/lib/actions/auth-actions";
import { DashboardShell } from "@/components/dashboard-shell";
import { Tour } from "@/components/tour";
import { OWNER_TOUR, OWNER_TOUR_KEY } from "./tour-steps";
import { isExploring } from "@/lib/explore-mode";
import { activeOrg } from "@/lib/active-org";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/plan", label: "Monthly plan" },
  { href: "/dashboard/campaigns", label: "Campaigns" },
  { href: "/dashboard/analytics", label: "Performance" },
  { href: "/dashboard/creatives", label: "Creatives" },
  // Was "Meta connection" when Meta was the only place to advertise. The
  // Meta-specific screen still exists at /dashboard/meta and is linked from
  // here, because it does more than connect — it picks a Page and explains
  // Meta's own failure modes.
  { href: "/dashboard/integrations", label: "Where you advertise" },
  { href: "/dashboard/agents", label: "AI specialists" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/dashboard/guide", label: "How it works" },
];

// Pages the not-yet-connected client can still open.
//
// /dashboard/meta is the obvious one — it is where the funnel sends them and
// there has to be somewhere to land. Settings is the less obvious one, and
// leaving it out was a trap: someone who mistyped their business name at
// signup is by definition someone who has not connected an ad account yet, so
// gating the only screen that fixes it behind connecting one leaves them stuck
// with a name the AI will put in every ad it writes.
//
// /dashboard/integrations joins them for the same reason as /dashboard/meta:
// it is now the screen that lists every network a business can connect, and
// gating "connect somewhere to advertise" behind having connected somewhere
// to advertise is the same trap in a wider form.
const ALWAYS_REACHABLE = [
  "/dashboard/meta",
  "/dashboard/integrations",
  "/dashboard/settings",
  "/dashboard/guide",
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const active = await activeOrg();
  const organizationId = active?.id ?? session.user.organizationId;

  // A freelancer who has not opened a client yet has nothing to show here —
  // their workspace runs no ads of its own. Send them to pick one.
  if (session.user.role === "FREELANCER" && !active?.actingAsClient) {
    redirect("/clients");
  }

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
      {/* Offered on the first visit after setup, and on demand after that.
          Mounted in the layout so it works from whichever screen someone
          starts it on — every step points at the sidebar, which is always
          there.

          Gated on having finished onboarding rather than on a query
          parameter, because a layout cannot read one, and because being
          shown around before you have told MAIRO what your business is would
          be a tour of screens that have nothing in them yet. The tour itself
          remembers it has run, so this offers it exactly once. */}
      <Tour steps={OWNER_TOUR} storageKey={OWNER_TOUR_KEY} autoStart={Boolean(intake)} />

      {/* Whose account you are in, and the way back out. A freelancer moving
          between clients needs this on every screen — editing the wrong
          business's campaigns because you forgot which one you had open is
          exactly the mistake this prevents. */}
      {active?.actingAsClient && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
          <p className="text-sm text-neutral-300">
            Working in <span className="font-medium text-white">{organization?.name}</span>
          </p>
          <Link
            href="/clients"
            className="shrink-0 rounded-lg border border-white/15 px-4 py-2 text-xs text-neutral-300 transition hover:border-white/40 hover:text-white"
          >
            All clients
          </Link>
        </div>
      )}

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
