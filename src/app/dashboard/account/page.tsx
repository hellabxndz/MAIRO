import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { showsEnquiries } from "@/lib/leads/fields";
import { socialAccess } from "@/lib/social/access";
import { planFor } from "@/lib/plans";
import { loadPixelSetup } from "@/lib/tracking/pixel-setup";
import { PIXEL_STATUS_LABEL } from "@/lib/tracking/pixel-rules";
import { viewMode } from "@/lib/view-mode";
import { signOutAction } from "@/lib/actions/auth-actions";
import { ViewToggle } from "@/components/mairo/app-shell";
import { ThemeToggle } from "@/components/theme/theme";
import { StartTourLink } from "@/components/tour";
import { FeedbackButton } from "@/components/success/feedback";
import { CaseStudyConsent } from "@/components/success/consent";

// Account: everything that isn't one of the four sections, behind the
// profile button.
//
// The things an owner comes here for are listed first and by name, the way
// any app's settings are: the business, Meta, tracking, billing and plan,
// notifications, help, log out. The rest of MAIRO's pages (the full approval
// history, the AI team's activity, reports, team members) sit under "More",
// one tap away rather than in the navigation. Every one of those routes is
// unchanged.

export const dynamic = "force-dynamic";

type Row = { href: string; label: string; hint: string; status?: { text: string; tone: "ok" | "warn" | "muted" } };

const TONE = { ok: "text-emerald-300", warn: "text-amber-200", muted: "text-faint" } as const;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[12px] font-medium text-faint">{title}</h2>
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--mairo-line)", background: "rgba(var(--mairo-fg-rgb),0.02)" }}>
        {children}
      </div>
    </section>
  );
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul>
      {rows.map((r, i) => (
        <li key={r.href} className={i > 0 ? "border-t" : undefined} style={i > 0 ? { borderColor: "var(--mairo-line)" } : undefined}>
          <Link href={r.href} className="flex min-h-[60px] items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.03]">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] text-white">{r.label}</span>
              <span className="block text-[12.5px] text-muted">{r.hint}</span>
            </span>
            {r.status && <span className={`shrink-0 text-[12.5px] ${TONE[r.status.tone]}`}>{r.status.text}</span>}
            <span aria-hidden className="text-faint">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Line({ label, hint, children, first = false }: { label: string; hint: string; children: ReactNode; first?: boolean }) {
  return (
    <div className={`flex min-h-[60px] flex-wrap items-center gap-3 px-4 py-3 ${first ? "" : "border-t"}`} style={first ? undefined : { borderColor: "var(--mairo-line)" }}>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-white">{label}</span>
        <span className="block text-[12.5px] text-muted">{hint}</span>
      </span>
      {children}
    </div>
  );
}

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  const [organization, meta, leadForm, social, pixel, mode] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, subscriptionTier: true, subscriptionStatus: true, caseStudyConsentAt: true },
    }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true, pageName: true } }),
    db.leadForm.findFirst({ where: { organizationId }, select: { id: true } }),
    socialAccess(organizationId),
    loadPixelSetup(organizationId).catch(() => null),
    viewMode(),
  ]);
  const plan = planFor(organization?.subscriptionTier ?? "NONE");
  const pixelOk = pixel?.status === "receiving" || pixel?.status === "purchases_verified";
  const pixelOptional = pixel?.need === "optional" || pixel?.decision === "declined";

  const main: Row[] = [
    { href: "/dashboard/settings", label: "Business profile", hint: "Your name, website, brand and what MAIRO knows about you" },
    {
      href: "/dashboard/meta",
      label: "Connected Meta account",
      hint: meta?.pageName ? `Facebook and Instagram · ${meta.pageName}` : "Your Facebook Page and ad account",
      status: meta ? (meta.status === "CONNECTED" ? { text: "Connected", tone: "ok" } : { text: "Needs attention", tone: "warn" }) : { text: "Not connected", tone: "warn" },
    },
    {
      href: "/dashboard/pixel",
      label: "Pixel & tracking",
      hint: "How sales and leads from your ads are counted",
      status: pixel ? { text: PIXEL_STATUS_LABEL[pixel.status], tone: pixelOk ? "ok" : pixelOptional ? "muted" : "warn" } : undefined,
    },
  ];
  const billing: Row[] = [
    { href: "/dashboard/billing", label: "Billing & subscription", hint: "Your plan, payment method and invoices", status: { text: plan.name, tone: "muted" } },
    { href: "/dashboard/billing#plans", label: "Change plan", hint: "Compare Pro and Scale, and switch" },
  ];
  const more: Row[] = [
    { href: "/dashboard/decisions", label: "All approvals", hint: "Everything MAIRO asked you, and what you decided" },
    { href: "/dashboard/team", label: "MAIRO's activity", hint: "What MAIRO checked and did, and when it looks next" },
    { href: "/dashboard/reports", label: "Weekly and monthly reports", hint: "Summaries you can share" },
    { href: "/dashboard/settings#go-live", label: "Automation and spend limits", hint: "What MAIRO may do on its own, and the most it may spend" },
    { href: "/dashboard/website", label: "Website check", hint: "What your website needs before you spend on ads" },
    { href: "/dashboard/settings/team", label: "Team members", hint: "Who can see and approve" },
    { href: "/dashboard/settings/businesses", label: "Your businesses", hint: "Scale covers up to 3 businesses" },
    ...(showsEnquiries({ hasForm: Boolean(leadForm) }) ? [{ href: "/dashboard/leads", label: "Enquiries", hint: "People who asked you to get in touch" }] : []),
    ...(social.ok ? [{ href: "/dashboard/social", label: "Social Manager", hint: "Your posts from the earlier Scale plan" }] : []),
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[clamp(24px,3vw,30px)] font-semibold tracking-[-0.02em] text-white">Account</h1>
      <p className="mt-1 text-[14px] text-muted">
        {organization?.name ?? "Your business"} · {plan.name}
        {session.user.email ? ` · ${session.user.email}` : ""}
      </p>

      <div className="mt-7 space-y-6">
        <Group title="Your business">
          <Rows rows={main} />
        </Group>

        <Group title="Plan">
          <Rows rows={billing} />
        </Group>

        <Group title="Preferences">
          <Rows rows={[{ href: "/dashboard/notifications", label: "Notifications", hint: "What MAIRO tells you about, and how" }]} />
          <Line label="Appearance" hint="Dark or light">
            <ThemeToggle className="h-10 w-10" />
          </Line>
          <Line label="Level of detail" hint="Advanced shows every figure and setting on each screen">
            <ViewToggle mode={mode} />
          </Line>
        </Group>

        <Group title="Help">
          <Rows rows={[{ href: "/dashboard/guide", label: "Help center", hint: "How MAIRO works — approvals, billing, tracking — with search" }]} />
          <Line label="Tell the MAIRO team something" hint="A problem, something confusing, or an idea">
            <FeedbackButton className="shrink-0 rounded-full border border-[color:var(--mairo-line)] px-4 py-2 text-[13px] text-white/85 transition hover:text-white" />
          </Line>
          <Line label="Take the tour again" hint="Thirty seconds around the four sections">
            <StartTourLink className="shrink-0 text-[13.5px] text-white underline underline-offset-4" />
          </Line>
          <div className="border-t" style={{ borderColor: "var(--mairo-line)" }}>
            <CaseStudyConsent given={Boolean(organization?.caseStudyConsentAt)} />
          </div>
        </Group>

        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 text-[13.5px] text-muted hover:text-white [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="transition group-open:rotate-90">›</span> More
          </summary>
          <div className="mt-2">
            <Group title="Everything else">
              <Rows rows={more} />
            </Group>
          </div>
        </details>

        <form action={signOutAction}>
          <button type="submit" className="min-h-12 w-full rounded-2xl border text-[15px] text-white transition hover:bg-white/[0.04]" style={{ borderColor: "var(--mairo-line)" }}>
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
