import Link from "next/link";
import { ConfidenceText } from "./plan-view";
import type { Confidence } from "@/lib/engine/core";
import type { MissionActivity } from "@/lib/mission/store";
import type { ResultTile } from "@/lib/mission/goals";
import { FixThisForMe } from "@/components/decisions/fix-this-for-me";
import { GoalActions } from "@/app/dashboard/mission/mission-client";

// The mission at a glance, in the order an owner asks: what are we trying to
// do, what is MAIRO doing, what happened, what did MAIRO learn, what's next.

const panel = "rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5";
const eyebrow = "text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright";

/** Smaller headline for pages that aren't the dashboard. */
export function MissionHeadline({ title, sentence, strategy, secondary, confidence }: { title: string; sentence: string; strategy?: string; secondary?: string | null; confidence?: Confidence | null }) {
  return (
    <div>
      <p className={eyebrow}>Current MAIRO mission</p>
      <h2 className="mt-1 flex items-center gap-2 text-[24px] font-semibold text-white">
        <span aria-hidden>🎯</span>{title}
      </h2>
      <p className="mt-1 text-[14.5px] text-white/80">{sentence}</p>
      {strategy && <p className="mt-2 max-w-[760px] text-[13.5px] text-muted">{strategy}</p>}
      {secondary && <p className="mt-1 text-[12.5px] text-faint">Secondary goal: {secondary}</p>}
      {confidence && <p className="mt-2 text-[13px] text-white/75"><ConfidenceText level={confidence.level} text={confidence.customer} /></p>}
    </div>
  );
}

/** The top of the dashboard: the goal, said plainly, and the two ways to change it. */
export function GoalHero({
  greeting,
  primary,
  title,
  sentence,
  strategy,
  secondary,
  startedAt,
  confidence,
}: {
  greeting: string;
  primary: string;
  title: string;
  sentence: string;
  strategy: string;
  secondary: string | null;
  startedAt: Date | null;
  confidence?: Confidence | null;
}) {
  return (
    <section
      aria-labelledby="current-goal"
      className="relative overflow-hidden rounded-3xl border border-violet/30 p-6 sm:p-8"
      style={{ background: "radial-gradient(120% 140% at 100% 0%, rgba(124,92,255,0.22), transparent 55%), radial-gradient(90% 120% at 0% 100%, rgba(59,107,255,0.14), transparent 60%), #0b1122" }}
    >
      <p className="text-[14px] text-white/70">{greeting}</p>
      <p className={`${eyebrow} mt-4`}>Your current goal</p>
      <h2 id="current-goal" className="mt-2 flex items-center gap-3 text-[clamp(26px,3.4vw,40px)] font-semibold leading-tight tracking-[-0.02em] text-white">
        <span aria-hidden>🎯</span>
        {primary}
      </h2>
      <p className="mt-2 max-w-[760px] text-[16px] leading-relaxed text-white/85">&ldquo;{sentence}&rdquo;</p>
      <dl className="mt-5 grid gap-4 text-[13.5px] sm:grid-cols-3">
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Current strategy</dt>
          <dd className="mt-1 text-white/85">{strategy}</dd>
          {title !== primary && <dd className="mt-1 text-[12.5px] text-muted">Mission: {title}</dd>}
          {confidence && <dd className="mt-2 text-[13px] text-white/75"><ConfidenceText level={confidence.level} text={confidence.customer} /></dd>}
        </div>
        <div className="space-y-3">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Secondary goal</dt>
            <dd className="mt-1 text-white/85">{secondary ?? "None"}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.14em] text-faint">Strategy started</dt>
            <dd className="mt-1 text-white/85">{startedAt ? startedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}</dd>
          </div>
        </div>
      </dl>
      <GoalActions />
      <Link href="/dashboard/mission" className="mt-4 inline-block text-[13px] text-violet-bright underline underline-offset-4">See the full plan</Link>
    </section>
  );
}

function Row({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-start justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.04]">
        <span className="min-w-0">
          <span className="block text-[11px] uppercase tracking-[0.14em] text-faint">{label}</span>
          <span className="mt-0.5 block text-[14.5px] text-white/90">{value}</span>
        </span>
        <span aria-hidden className="mt-3 text-[13px] text-faint transition group-hover:text-white">›</span>
      </Link>
    </li>
  );
}

export function DoingNow({ activity }: { activity: MissionActivity }) {
  const a = activity;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const optimizing =
    a.optimizing.campaigns === 0
      ? null
      : a.optimizing.how === "autopilot"
        ? `${plural(a.optimizing.campaigns, "campaign")} on Full Autopilot`
        : a.optimizing.how === "automatic"
          ? `${plural(a.optimizing.campaigns, "campaign")} with AI Assist`
          : `${plural(a.optimizing.campaigns, "campaign")} — changes wait for your approval`;
  return (
    <section className={panel}>
      <h3 className={eyebrow}>What MAIRO is doing</h3>
      <ul className="-mx-3 mt-2">
        <Row label="Running" value={plural(a.campaignsRunning, "campaign")} href="/dashboard/campaigns" />
        <Row label="Testing" value={plural(a.creativesTesting, "creative")} href="/dashboard/campaigns" />
        {optimizing && <Row label="Optimizing" value={optimizing} href="/dashboard/decisions" />}
        {a.socialScheduled !== null && <Row label="Scale plan" value={`${plural(a.socialScheduled, "social post")} scheduled this week`} href="/dashboard/social/calendar" />}
        {a.promotion && <Row label="Promotion" value={`${a.promotion}${a.promotionsActive > 1 ? ` (+${a.promotionsActive - 1} more)` : ""}`} href="/dashboard/mission" />}
      </ul>
    </section>
  );
}

export function GoalResults({ tiles, days, hasData }: { tiles: ResultTile[]; days: number; hasData: boolean }) {
  return (
    <section className={panel}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={eyebrow}>Results for your goal</h3>
        <span className="text-[12px] text-faint">Last {days} days</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 rounded-xl bg-white/[0.03] px-3.5 py-3" title={t.hint}>
            <dt className="text-[12px] text-muted">{t.label}</dt>
            <dd className={`mt-1 tabular-nums ${t.value === null ? "text-[13px] text-faint" : "text-[24px] font-semibold text-white"}`}>{t.value ?? "Not tracked yet"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] text-faint">
        {hasData ? "Only results Meta tracked for this goal. Likes and clicks are never counted as sales." : "Results appear once a campaign has been running for a day or two."}
      </p>
    </section>
  );
}

export function Learned({ items }: { items: { learned: string; adjusted: string }[] }) {
  return (
    <section className={panel}>
      <h3 className={eyebrow}>MAIRO learned</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-[14px] text-white/80">MAIRO is collecting more data before making a recommendation.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {items.map((i) => (
            <li key={i.learned}>
              <p className="text-[14px] text-white/90">&ldquo;{i.learned}&rdquo;</p>
              <p className="mt-0.5 text-[12.5px] text-emerald-300/90"><span className="font-semibold">MAIRO adjusted: </span>{i.adjusted}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export type NextItem = {
  title: string;
  text: string;
  /** A link to act on it. */
  href?: string;
  label?: string;
  /** Decisions that need the owner's approval: shows "Approve action". */
  approveDecisionIds?: string[];
};

export function NextActions({ items, fallback, heading = "What MAIRO is doing next" }: { items: NextItem[]; fallback: string; heading?: string }) {
  return (
    <section className={panel}>
      <h3 className={eyebrow}>{heading}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-[14px] text-white/85">{fallback}</p>
      ) : (
        <ul className="mt-2 space-y-4">
          {items.map((r) => (
            <li key={r.title} className="min-w-0">
              <p className="text-[14px] font-medium text-white">{r.title}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-white/75">{r.text}</p>
              <div className="flex flex-wrap items-center gap-2">
                {r.approveDecisionIds && r.approveDecisionIds.length > 0 && <FixThisForMe decisionIds={r.approveDecisionIds} label="Approve action" />}
                {r.href && (
                  <Link href={r.href} className="mt-3 inline-flex rounded-lg border border-white/12 px-3 py-1.5 text-[12.5px] text-white/85 hover:border-white/30">{r.label ?? "Open"}</Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Scale: Social Manager at a glance. Everyone else: what it is, locked. */
export function SocialCard({ activity, upgradeHref }: { activity: MissionActivity; upgradeHref: string }) {
  if (activity.socialScheduled === null) {
    return (
      <section className={`${panel} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-white">
            <svg viewBox="0 0 16 16" className="h-4 w-4 text-violet-bright" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            Social Manager
          </h3>
          <p className="mt-1 text-[13.5px] text-muted">AI social media management is available with Scale.</p>
        </div>
        <Link href={upgradeHref} className="inline-flex min-h-[42px] shrink-0 items-center rounded-lg bg-[#7c5cff] px-4 text-[13.5px] font-medium text-white hover:brightness-110">Upgrade to Scale</Link>
      </section>
    );
  }
  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={eyebrow}>Social content · Scale</h3>
        <Link href="/dashboard/social" className="text-[13px] text-violet-bright underline underline-offset-4">View Social Manager</Link>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-[12px] text-muted">Posts scheduled</dt>
          <dd className="mt-0.5 text-[20px] font-semibold tabular-nums text-white">{activity.socialScheduled}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">Next post</dt>
          <dd className="mt-0.5 text-[15px] text-white">{activity.nextPost ? `${activity.nextPost.when} · ${activity.nextPost.network}` : "Nothing approved yet"}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">Current organic goal</dt>
          <dd className="mt-0.5 text-[15px] text-white">{activity.organicGoal ?? "Not set yet"}</dd>
        </div>
      </dl>
    </section>
  );
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-emerald-400/15 text-emerald-300",
  PAUSED: "bg-white/[0.06] text-white/60",
  PENDING_REVIEW: "bg-amber-400/15 text-amber-200",
  DRAFT: "bg-white/[0.06] text-white/60",
};

/** The campaigns, in owner language: no sales columns for a goal that isn't sales. */
export function GoalCampaigns({ campaigns }: { campaigns: { id: string; name: string; status: string; goalLabel: string }[] }) {
  return (
    <section className={panel}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={eyebrow}>Your campaigns</h3>
        <Link href="/dashboard/campaigns" className="text-[13px] text-violet-bright underline underline-offset-4">All campaigns</Link>
      </div>
      {campaigns.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-muted">No campaigns yet. MAIRO prefilled one from your plan — confirm it in Create.</p>
      ) : (
        <ul className="-mx-3 mt-2">
          {campaigns.slice(0, 5).map((c) => (
            <li key={c.id}>
              <Link href={`/dashboard/campaigns/${c.id}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.04]">
                <span className="min-w-0">
                  <span className="block truncate text-[14px] text-white">{c.name}</span>
                  <span className="block text-[12px] text-faint">{c.goalLabel}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] ${STATUS_TONE[c.status] ?? STATUS_TONE.DRAFT}`}>
                  {c.status === "PENDING_REVIEW" ? "In review" : c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
