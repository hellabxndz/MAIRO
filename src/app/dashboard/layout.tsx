import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { signOutAction } from "@/lib/actions/auth-actions";
import { AppShell } from "@/components/mairo/app-shell";
import { MairoAssistant } from "@/components/mairo/assistant";
import { findOrCreateThread, loadThreadMessages } from "@/lib/ai/threads";
import { assistantNameOf, CLIENT_AGENT } from "@/lib/ai/agents";
import { hasActivePlan } from "@/lib/readiness";
import { viewMode } from "@/lib/view-mode";
import { Tour } from "@/components/tour";
import { hasSeenTour } from "@/lib/actions/tour-actions";
import { OWNER_TOUR } from "./tour-steps";
import { isExploring } from "@/lib/explore-mode";
import { activeOrg } from "@/lib/active-org";
import { showsEnquiries } from "@/lib/leads/fields";

// Enquiries is the one destination that is not shown to everybody, because
// most businesses do not collect them and an empty inbox in the sidebar is
// noise. Everything else in the old eleven-item NAV moved into the new shell's
// primary list or onto /dashboard/account — none of it was deleted, and every
// route is unchanged.
//
// See src/components/mairo/app-shell.tsx for the map from the old labels.
const ENQUIRIES_NAV = {
  href: "/dashboard/leads",
  label: "Enquiries",
  icon: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2.6" y="4.4" width="14.8" height="11.2" rx="2.2" />
      <path d="M3.2 6.2l6.8 4.6 6.8-4.6" />
    </svg>
  ),
};

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
// /dashboard/leads is here on the same principle rather than as a convenience.
// The lead form is a page MAIRO hosts at /f/<slug>; it does not live on Meta,
// does not need an ad account to exist, and works the moment it is written.
// Onboarding now sends anyone who answered "they fill in a form" straight to it,
// and gating the one thing that does not depend on Meta behind connecting Meta
// would send them to a screen they were not ready for and lose the answer they
// had just given.
const ALWAYS_REACHABLE = [
  "/dashboard/meta",
  "/dashboard/integrations",
  "/dashboard/settings",
  "/dashboard/guide",
  "/dashboard/leads",
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

  const [organization, intake, metaAccount, seenTour, leadForm] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        assistantName: true,
      },
    }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { id: true } }),
    hasSeenTour(),
    db.leadForm.findFirst({ where: { organizationId }, select: { id: true } }),
  ]);

  // Whether this business collects enquiries at all. The rule itself, and why
  // it is wider than "uses Meta's instant form", is in showsEnquiries.
  const collectsLeads = showsEnquiries({ hasForm: Boolean(leadForm) });

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

  const mode = await viewMode();

  // The assistant's thread. Same thread the full-page chat uses, so the panel
  // and the page are one conversation rather than two that each forget the
  // other. Created lazily on first dashboard load and reused after that.
  const assistant =
    organization && hasActivePlan(organization) && session.user.id
      ? await (async () => {
          const thread = await findOrCreateThread(session.user.id!, organizationId, CLIENT_AGENT);
          return { threadId: thread.id, messages: await loadThreadMessages(thread.id) };
        })()
      : null;

  return (
    <AppShell
      mode={mode}
      businessName={organization?.name ?? ""}
      userName={session.user.name ?? ""}
      showUpgrade={organization?.subscriptionTier !== "AGENCY"}
      assistantName={assistantNameOf(organization?.assistantName)}
      extraNav={collectsLeads ? [ENQUIRIES_NAV] : []}
      footer={
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full rounded-xl px-3 py-2.5 text-left text-[13px] text-faint transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            Sign out
          </button>
        </form>
      }
    >
      {/* Offered on the first visit after setup, and on demand after that.
          Mounted in the layout so it works from whichever screen someone
          starts it on — every step points at the sidebar, which is always
          there.

          Gated on having finished onboarding rather than on a query
          parameter, because a layout cannot read one, and because being
          shown around before you have told MAIRO what your business is would
          be a tour of screens that have nothing in them yet.

          Whether they have seen it comes from their user row, not from the
          browser — so signing in on a phone, in a private window, or after
          clearing site data does not start it again. */}
      {/* Starts on the dashboard home, not on whatever screen happens to be
          first. Onboarding now drops anyone who answered "they fill in a form"
          onto /dashboard/leads to write it, and the tour was opening on top of
          that — a nine-step walkthrough of the product over the one task they
          were sent there to finish. A tour of the dashboard belongs on the
          dashboard; it is still available on demand from Account. */}
      <Tour
        steps={OWNER_TOUR}
        autoStart={Boolean(intake) && pathname === "/dashboard"}
        alreadySeen={seenTour}
      />

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

      {/* MAIRO, reachable from every screen. Mounted here rather than per page
          for the same reason the tour is: it has to be available wherever
          somebody gets stuck, and the thread is the account's, not the page's.

          Only for accounts whose plan includes it — the endpoint costs real
          money to serve and already refuses without one, so a launcher that
          opens onto a refusal would be a button that lies. */}
      {assistant && (
        <MairoAssistant
          threadId={assistant.threadId}
          initialMessages={assistant.messages}
          businessName={organization?.name ?? "your business"}
          assistantName={assistantNameOf(organization?.assistantName)}
        />
      )}
    </AppShell>
  );
}
