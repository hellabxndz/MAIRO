import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { viewMode } from "@/lib/view-mode";
import { loadTeam } from "@/lib/team/store";
import { loadBrief } from "@/lib/team/brief-store";
import { loadIntelligence } from "@/lib/intelligence/run";
import { campaignJourney } from "@/lib/intelligence/timeline";
import { toView } from "@/lib/decisions/store";
import { AgentCard } from "@/components/team/agent-ui";
import { DailyBrief } from "@/components/team/daily-brief";
import { MairoDecisionCard } from "@/components/decisions/decision-card";
import { BusinessHealthScore } from "@/components/intelligence/business-health";
import { OpportunityRadar } from "@/components/intelligence/opportunity-radar";
import { EarlyWarnings } from "@/components/intelligence/early-warnings";
import { CampaignTimeline } from "@/components/intelligence/campaign-timeline";
import { Reveal } from "@/components/viz/motion";

// MAIRO Intelligence: one workspace for what the eight specialties found —
// the Morning Brief, the decisions waiting for the owner, the health of the
// account, the opportunities and early warnings, and the campaign's own
// timeline — with one way to ask about any of it. Everything here is read
// from records (runs, decisions, insights, Meta's reports); nothing is
// generated for this page, and nothing on it acts without the owner.

export const metadata = { title: "Intelligence" };
export const dynamic = "force-dynamic";

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-signal";

export default async function IntelligencePage() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const now = new Date();
  const [team, intelligence, mode, pending, latest] = await Promise.all([
    loadTeam(organizationId, { agent: null, now }),
    loadIntelligence(organizationId),
    viewMode(),
    db.mairoDecision.findMany({ where: { organizationId, status: "PENDING" }, orderBy: [{ urgent: "desc" }, { createdAt: "desc" }], take: 4 }),
    db.mairoCampaign.findFirst({ where: { organizationId, status: { not: "ARCHIVED" } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], select: { id: true, name: true } }),
  ]);
  const [brief, journey] = await Promise.all([loadBrief(organizationId, team, now), latest ? campaignJourney(organizationId, latest.id, now).catch(() => null) : null]);
  const advanced = mode === "advanced";
  const report = intelligence.report;
  const warnings = intelligence.insights.filter((i) => i.earlyWarning).length;

  return (
    <div className="mx-auto max-w-[1180px] space-y-8">
      <header>
        <p className={eyebrow}>MAIRO Intelligence</p>
        <h1 className="mt-2 text-[clamp(26px,3.4vw,34px)] font-semibold tracking-[-0.02em] text-white">What your AI team sees, and what it needs from you</h1>
        <p className="mt-3 max-w-[720px] text-[15px] leading-relaxed text-white/80">
          Strategy, audience, creative, campaigns, optimization, budget, analytics and growth — in one place, from your account&rsquo;s own records. Ask one assistant about any of it; nothing changes without your approval.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/dashboard/agents" className="rounded-full bg-[image:var(--mairo-ramp)] px-5 py-2.5 text-[13.5px] font-medium shadow-[var(--mairo-glow-key)]">
            Ask MAIRO
          </Link>
          <a href="#decisions" className="rounded-full border border-[color:var(--mairo-line-lit)] px-5 py-2.5 text-[13.5px] text-white">
            {pending.length ? `${team.pending} decision${team.pending === 1 ? "" : "s"} waiting` : "No decisions waiting"}
          </a>
          {warnings > 0 && (
            <a href="#warnings" className="rounded-full border border-amber-400/40 px-5 py-2.5 text-[13.5px] text-amber-200">
              {warnings} early warning{warnings === 1 ? "" : "s"}
            </a>
          )}
        </div>
      </header>

      <Reveal>
        <section aria-labelledby="brief" className="rounded-[28px] border border-[color:var(--mairo-line)] p-6 sm:p-7" style={{ background: "linear-gradient(160deg, rgba(45,212,191,0.08), rgba(var(--mairo-fg-rgb),0.015) 60%)" }}>
          <h2 id="brief" className={eyebrow}>Morning Brief</h2>
          <div className="mt-3">
            <DailyBrief brief={brief} now={now} timeZone={team.timeZone} />
          </div>
        </section>
      </Reveal>

      <section aria-labelledby="specialists">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="specialists" className={eyebrow}>The eight specialties</h2>
          <Link href="/dashboard/team" className="text-[12.5px] text-muted hover:text-white">Everything they did →</Link>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {team.statuses.map((s) => (
            <AgentCard key={s.role} status={s} pending={team.pendingByAgent[s.role] ?? 0} contribution={team.contribution[s.role] ?? null} now={now} timeZone={team.timeZone} />
          ))}
        </div>
      </section>

      <section id="decisions" aria-labelledby="decisions-title" className="scroll-mt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="decisions-title" className={eyebrow}>MAIRO Decisions</h2>
          <Link href="/dashboard/decisions" className="text-[12.5px] text-muted hover:text-white">Approval Center →</Link>
        </div>
        <p className="mt-2 max-w-[760px] text-[13px] text-muted">Each one says what would change, why, and what it would cost. Approving one asks MAIRO to make that change in Meta; MAIRO says when Meta confirms it.</p>
        {pending.length === 0 ? (
          <p className="mt-4 text-[14px] text-muted">Nothing waiting. Recommendations appear once a campaign has run long enough to judge.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {pending.map((d) => (
              <MairoDecisionCard key={d.id} decision={toView(d)} advanced={advanced} timeZone={team.timeZone} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <BusinessHealthScore health={report?.health ?? null} />
        <OpportunityRadar radar={report?.radar ?? null} insights={intelligence.insights} />
      </div>

      <section id="warnings" className="scroll-mt-24">
        <EarlyWarnings insights={intelligence.insights} advanced={advanced} />
      </section>

      <CampaignTimeline journey={journey} campaigns={latest ? [{ id: latest.id, name: latest.name }] : []} advanced={advanced} />

      <Link href="/dashboard?mode=profit" className="block rounded-[24px] border border-[color:var(--mairo-line)] p-5 transition hover:border-[color:var(--mairo-line-lit)]">
        <p className={eyebrow}>Profit First</p>
        <p className="mt-2 text-[15px] text-white">Is your advertising making money?</p>
        <p className="mt-1 text-[13px] text-muted">Revenue, estimated profit and break-even from your own costs and Meta&rsquo;s reported sales — with what each figure is based on.</p>
      </Link>
    </div>
  );
}
