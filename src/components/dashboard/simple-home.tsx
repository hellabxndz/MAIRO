import Link from "next/link";
import type { ReactNode } from "react";
import { DrawerButton } from "@/components/mairo/overlay";
import { actionClass, quietClass } from "@/components/mairo/action-styles";
import { ChangeGoalModalButton, GoalStarters, TellMairoModalButton } from "@/components/mairo/goal-actions";
import type { Tile } from "@/lib/dashboard/home";

// The Overview's six cards. Each has one purpose, one primary message and one
// obvious action; deeper information is one click away, never on the card.
//
// Calm by design: whitespace, large readable numbers, soft surfaces instead of
// borders and tables.

const card = "rounded-[28px] p-6 sm:p-7";
const surface = { background: "linear-gradient(180deg, rgba(var(--mairo-fg-rgb),0.035), rgba(var(--mairo-fg-rgb),0.015))" };
const eyebrow = "text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright";

export function HomeHeader({ greeting }: { greeting: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-[clamp(24px,3vw,30px)] font-semibold tracking-[-0.02em] text-white">{greeting}</h1>
      <p className="mt-1 text-[14.5px] text-muted">Here&rsquo;s your marketing at a glance.</p>
    </header>
  );
}

/** 1. What am I trying to accomplish? */
export function GoalCard({ goal, sentence, secondary, confidence }: { goal: string; sentence: string; secondary: string | null; confidence: string | null }) {
  return (
    <section aria-labelledby="your-goal" className={card}
      style={{ background: "radial-gradient(110% 140% at 100% 0%, rgba(124,92,255,0.22), transparent 55%), radial-gradient(80% 120% at 0% 100%, rgba(59,107,255,0.12), transparent 60%), rgba(var(--mairo-bg-rgb),0.85)" }}>
      <p className={eyebrow}>Your goal</p>
      <h2 id="your-goal" className="mt-2 flex items-center gap-3 text-[clamp(26px,3.4vw,38px)] font-semibold leading-tight tracking-[-0.02em] text-white">
        <span aria-hidden>🎯</span>{goal}
      </h2>
      <p className="mt-2 max-w-[720px] text-[15.5px] leading-relaxed text-white/80">{sentence}</p>
      {(secondary || confidence) && (
        <p className="mt-2 text-[13px] text-faint">{[secondary ? `Also: ${secondary}` : null, confidence].filter(Boolean).join(" · ")}</p>
      )}
      <div className="mt-5 flex flex-wrap gap-2.5">
        <ChangeGoalModalButton />
        <TellMairoModalButton />
      </div>
    </section>
  );
}

/** A plan MAIRO made that's waiting for the owner, shown in place of the goal. */
export function ProposalCard({ title, sentence }: { title: string; sentence: string }) {
  return (
    <section className={card} style={{ background: "radial-gradient(110% 140% at 100% 0%, rgba(124,92,255,0.25), transparent 55%), rgba(var(--mairo-bg-rgb),0.85)" }}>
      <p className={eyebrow}>MAIRO created a plan</p>
      <h2 className="mt-2 text-[clamp(24px,3vw,32px)] font-semibold text-white">🎯 {title}</h2>
      <p className="mt-2 max-w-[720px] text-[15px] text-white/80">{sentence}</p>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Link href="/dashboard/mission" className={actionClass}>Review and approve</Link>
        <ChangeGoalModalButton label="Choose a different goal" />
      </div>
    </section>
  );
}

/** 2. How is my business performing? Four numbers, for the goal. */
export function PerformanceCard({ tiles, note, period = "This month", outcome = null }: { tiles: Tile[]; note: string | null; period?: string; outcome?: { headline: string; detail: string | null } | null }) {
  return (
    <section aria-labelledby="performance" className={card} style={surface}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="performance" className={eyebrow}>{period}</h2>
        <Link href="/dashboard/analytics" className="text-[13px] text-muted hover:text-white">See full results →</Link>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0">
            <dd className="text-[clamp(26px,3.2vw,36px)] font-light tabular-nums leading-none tracking-[-0.02em] text-white">{t.value}</dd>
            <dt className="mt-2 text-[13px] text-muted" title={t.hint}>{t.label}</dt>
          </div>
        ))}
      </dl>
      {/* What came of the enquiries — the business's own marks, kept apart
          from what Meta reports. */}
      {outcome && (
        <Link href="/dashboard/leads" className="mt-5 block rounded-2xl bg-white/[0.035] px-4 py-3 transition hover:bg-white/[0.06]">
          <p className="text-[14px] text-white">{outcome.headline}</p>
          {outcome.detail && <p className="mt-0.5 text-[12.5px] text-muted">{outcome.detail}</p>}
        </Link>
      )}
      {note && <p className="mt-4 text-[12.5px] text-faint">{note}</p>}
    </section>
  );
}

export type WorkRow = { icon: string; text: string; href: string };

/** 3. What is MAIRO doing? Each row opens its page. */
export function WorkingOnCard({ rows }: { rows: WorkRow[] }) {
  return (
    <section aria-labelledby="working-on" className={card} style={surface}>
      <h2 id="working-on" className={eyebrow}>Mairo is working on</h2>
      <ul className="mt-3 -mx-3">
        {rows.map((r) => (
          <li key={r.text}>
            <Link href={r.href} className="group flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-white/[0.04]">
              <span aria-hidden className="text-[18px]">{r.icon}</span>
              <span className="min-w-0 flex-1 text-[15px] text-white/90">{r.text}</span>
              <span aria-hidden className="text-faint transition group-hover:translate-x-0.5 group-hover:text-white">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type AttentionItem = {
  key: string;
  title: string;
  text: string;
  action: { href: string; label: string; external?: boolean } | { drawerTitle: string; label: string; content: ReactNode };
};

/** 4. Does MAIRO need anything from me? Only when it does. */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-[28px] px-6 py-5 text-[15px] text-emerald-200" style={{ background: "rgba(52,211,153,0.06)" }}>
        <span aria-hidden>✓</span> Everything is running normally.
      </p>
    );
  }
  return (
    <section aria-labelledby="attention" className={card} style={{ background: "linear-gradient(180deg, rgba(251,191,36,0.07), rgba(var(--mairo-fg-rgb),0.015))" }}>
      <h2 id="attention" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">Needs your attention</h2>
      <ul className="mt-3 space-y-5">
        {items.map((i) => (
          <li key={i.key} className="flex flex-col items-start gap-3">
            <div className="min-w-0">
              <p className="text-[15.5px] font-medium text-white">{i.title}</p>
              <p className="mt-0.5 text-[13.5px] text-white/70">{i.text}</p>
            </div>
            {"href" in i.action ? (
              i.action.external ? (
                <a href={i.action.href} target="_blank" rel="noopener noreferrer" className={actionClass}>{i.action.label} ↗</a>
              ) : (
                <Link href={i.action.href} className={actionClass}>{i.action.label}</Link>
              )
            ) : (
              <DrawerButton label={i.action.label} title={i.action.drawerTitle} className={actionClass}>{i.action.content}</DrawerButton>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A small line, not the Business Brain itself: what MAIRO has learned, or a couple of questions to help it learn. */
export function BrainCard({ learnedCount, latest, questions }: { learnedCount: number; latest: string | null; questions: number }) {
  return (
    <section aria-labelledby="brain-card" className="flex flex-col gap-3 rounded-[22px] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6" style={surface}>
      <div className="min-w-0">
        <h2 id="brain-card" className={eyebrow}>Mairo knows your business</h2>
        <p className="mt-1.5 text-[14.5px] text-white">
          {learnedCount > 0
            ? `MAIRO has learned ${learnedCount} useful thing${learnedCount === 1 ? "" : "s"} about your business and marketing.`
            : "MAIRO is just getting to know your business."}
        </p>
        {latest ? (
          <p className="mt-0.5 text-[13px] text-muted">Latest: {latest}</p>
        ) : questions > 0 ? (
          <p className="mt-0.5 text-[13px] text-muted">Answer {questions} quick question{questions === 1 ? "" : "s"} to help MAIRO improve its recommendations.</p>
        ) : null}
      </div>
      <Link href={questions > 0 && !latest ? "/dashboard/settings/business-brain#improve" : "/dashboard/settings/business-brain"} className={`${quietClass} shrink-0`}>
        {questions > 0 && !latest ? "Help Mairo Learn" : "View Business Brain"}
      </Link>
    </section>
  );
}

/** 5. One insight, not twenty. */
export function InsightCard({ insight }: { insight: { text: string; why: string; evidence: { label: string; value: string }[]; href: string } | null }) {
  return (
    <section aria-labelledby="insight" className={card} style={surface}>
      <h2 id="insight" className={eyebrow}>Mairo insight</h2>
      {insight ? (
        <>
          <p className="mt-3 text-[18px] leading-snug text-white">&ldquo;{insight.text}&rdquo;</p>
          <div className="mt-4">
            <DrawerButton label="See why" title="Why MAIRO says this" className={quietClass}>
              <p className="text-[14.5px] leading-relaxed text-white/85">{insight.why}</p>
              {insight.evidence.length > 0 && (
                <dl className="mt-5 grid grid-cols-2 gap-3">
                  {insight.evidence.map((e) => (
                    <div key={e.label} className="rounded-2xl bg-white/[0.04] px-4 py-3">
                      <dt className="text-[12px] text-muted">{e.label}</dt>
                      <dd className="mt-1 text-[17px] tabular-nums text-white">{e.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <Link href={insight.href} className={`${actionClass} mt-6`}>Open the detailed results</Link>
            </DrawerButton>
          </div>
        </>
      ) : (
        <p className="mt-3 text-[14.5px] text-muted">MAIRO is still learning what works for your business. Insights appear once there&rsquo;s enough of your own data to be sure.</p>
      )}
    </section>
  );
}

/** 6. What happens next. */
export function NextCard({ items }: { items: { label: string; text: string; href?: string }[] }) {
  return (
    <section aria-labelledby="whats-next" className={card} style={surface}>
      <h2 id="whats-next" className={eyebrow}>What&rsquo;s next</h2>
      <ol className="mt-4 space-y-4">
        {items.map((i, n) => (
          <li key={`${i.label}-${n}`} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
            <span className="text-[13px] font-medium text-white/60">{i.label}</span>
            {i.href ? <Link href={i.href} className="text-[14.5px] text-white/90 hover:text-white">{i.text}</Link> : <span className="text-[14.5px] text-white/90">{i.text}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** No goal and no campaigns yet: one question, five answers. */
export function EmptyHome({ greeting }: { greeting: string }) {
  return (
    <section className="mx-auto max-w-[920px] py-6 text-center sm:py-12">
      <p className="text-[14px] text-muted">{greeting}</p>
      <h1 className="mt-3 text-[clamp(30px,4.5vw,46px)] font-semibold tracking-[-0.03em] text-white">Let&rsquo;s grow your business.</h1>
      <p className="mx-auto mt-3 max-w-[560px] text-[16px] text-white/75">What would you like MAIRO to help you accomplish?</p>
      <div className="mt-8 text-left"><GoalStarters /></div>
      <p className="mt-6 text-[13px] text-faint">MAIRO builds the plan and shows it to you first. Nothing launches or spends until you approve it.</p>
    </section>
  );
}
