import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT, AGENTS } from "@/lib/team/agents";
import { loadTeam } from "@/lib/team/store";
import { AgentCard, AgentIcon, FeedLine } from "@/components/team/agent-ui";

// Your MAIRO AI Team: the eight specialties, what each is really doing, the
// Daily Brief from the latest team review, and everything the team did —
// all read from recorded runs and decisions. An agent with nothing to do
// says it's idle.

export const metadata = { title: "Your AI Team — MAIRO" };
export const dynamic = "force-dynamic";

const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright";
const panel = { background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.015))" };

const WORKFLOW = [
  ["STRATEGIST", "reads your business and writes the plan around your goal"],
  ["AUDIENCE", "chooses who and where to reach, within what Meta supports"],
  ["CREATIVE", "writes the ads and makes the images"],
  ["ARCHITECT", "builds the campaign on Meta, switched off, and checks everything"],
  ["GUARDIAN", "checks the budget against your limits"],
  [null, "you review and approve — nothing is spent before this"],
  ["ARCHITECT", "launches through Meta"],
  ["ANALYST", "reads results once a day and writes your Daily Brief"],
  ["OPTIMIZER", "proposes improvements once there's enough data, with the numbers behind them"],
  ["GROWTH", "looks for room to grow, and says what it needs to see before suggesting more spend"],
] as const;

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/sign-in");
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const requested = (await searchParams).agent;
  const filter = AGENTS.some((a) => a.role === requested) ? (requested as AgentRole) : null;
  const now = new Date();
  const team = await loadTeam(organizationId, { agent: filter, now });

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6">
        <p className={eyebrow}>Your MAIRO AI Team</p>
        <h1 className="mt-2 text-[clamp(26px,3.4vw,34px)] font-semibold tracking-[-0.02em] text-white">Eight AI specialties working on your advertising</h1>
        <p className="mt-3 max-w-[720px] text-[15px] leading-relaxed text-white/80">{team.welcome}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/dashboard/agents" className="rounded-full bg-[image:var(--mairo-ramp)] px-5 py-2.5 text-[13.5px] font-medium text-white shadow-[var(--mairo-glow-key)]">
            Ask your AI team
          </Link>
          {team.pending > 0 && (
            <Link href="/dashboard/decisions" className="rounded-full border border-[color:var(--mairo-line-lit)] px-5 py-2.5 text-[13.5px] text-white">
              {team.pending} recommendation{team.pending === 1 ? "" : "s"} to review
            </Link>
          )}
        </div>
      </header>

      {/* The Daily MAIRO Brief: the latest team review, step by step. */}
      <section aria-labelledby="brief" className="mb-6 rounded-[28px] p-6 sm:p-7" style={{ background: "linear-gradient(160deg, rgba(124,92,255,0.14), rgba(var(--mairo-fg-rgb),0.015) 60%)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="brief" className={eyebrow}>Your Daily MAIRO Brief</h2>
          {team.brief && <p className="text-[12.5px] text-muted">{team.brief.at.toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" })}</p>}
        </div>
        {team.brief ? (
          <ul className="mt-4 space-y-3">
            {team.brief.lines.map((l) => (
              <li key={l.id} className="flex items-start gap-3">
                <AgentIcon role={l.agent} size={28} />
                <p className="text-[14px] leading-relaxed text-white/90">
                  <span className="text-white">{AGENT[l.agent].name}:</span> {l.summary}
                </p>
              </li>
            ))}
            {team.pending > 0 && (
              <li className="pl-[40px] text-[14px] text-amber-200">
                {team.pending} recommendation{team.pending === 1 ? " is" : "s are"} ready for your approval.{" "}
                <Link href="/dashboard/decisions" className="underline underline-offset-4">Review</Link>
              </li>
            )}
          </ul>
        ) : (
          <p className="mt-3 text-[14px] text-white/75">
            Your first Daily Brief arrives after the team&rsquo;s first review of a live campaign. Reviews run once a day, and when you open MAIRO.
          </p>
        )}
      </section>

      <section aria-label="Your AI team" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {team.statuses.map((s) => (
          <AgentCard key={s.role} status={s} pending={team.pendingByAgent[s.role] ?? 0} contribution={team.contribution[s.role] ?? null} now={now} />
        ))}
      </section>

      <section id="activity" aria-labelledby="activity-title" className="mt-8 scroll-mt-24 rounded-[28px] p-5 sm:p-7" style={panel}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="activity-title" className={eyebrow}>AI Team activity</h2>
          <p className="text-[12px] text-faint">The last 30 days. Every line is something that really ran.</p>
        </div>
        <nav aria-label="Filter by specialist" className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Link href="/dashboard/team#activity" aria-current={!filter ? "page" : undefined} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] ${!filter ? "bg-white/[0.1] text-white" : "text-muted hover:text-white"}`}>
            Everyone
          </Link>
          {AGENTS.map((a) => (
            <Link key={a.role} href={`/dashboard/team?agent=${a.role}#activity`} aria-current={filter === a.role ? "page" : undefined} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] ${filter === a.role ? "bg-white/[0.1] text-white" : "text-muted hover:text-white"}`}>
              {a.name}
            </Link>
          ))}
        </nav>
        {team.feed.length === 0 ? (
          <p className="mt-5 text-[14px] text-muted">
            {filter ? `Nothing from the ${AGENT[filter].name} in the last 30 days.` : "Nothing yet. As soon as the team does something — reads your website, writes your plan, builds or checks a campaign — it shows here."}
          </p>
        ) : (
          <ul className="-mx-3 mt-3">
            {team.feed.map((f) => (
              <FeedLine key={f.id} item={f} now={now} />
            ))}
          </ul>
        )}
      </section>

      <details className="mt-6 rounded-[28px] p-5 sm:p-7" style={panel}>
        <summary className="cursor-pointer text-[14px] text-white">How your AI team works</summary>
        <ol className="mt-4 space-y-2.5">
          {WORKFLOW.map(([role, text], i) => (
            <li key={i} className="flex items-start gap-3 text-[13.5px] text-white/85">
              <span className="w-5 shrink-0 text-right tabular-nums text-faint">{i + 1}.</span>
              <span>
                {role ? <span className="text-white">{AGENT[role].name}</span> : <span className="text-amber-200">You</span>} {text}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
          The eight specialties are parts of one AI system, not eight people or eight separate programs. They check on a schedule —
          once a day and when you open MAIRO — not every second. Nothing that launches a campaign, raises what you spend or changes
          who a running campaign reaches happens without your approval, unless you&rsquo;ve chosen an automation level in Settings that
          allows small changes; even then, never above your limits. MAIRO can&rsquo;t promise sales, leads or a particular return.
        </p>
      </details>
    </div>
  );
}
