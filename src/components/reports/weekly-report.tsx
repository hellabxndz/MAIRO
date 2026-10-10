/* eslint-disable @next/next/no-img-element -- an agency's own logo, from the address they gave */
import Link from "next/link";
import type { DecisionConfidence } from "@/generated/prisma/enums";
import { change, usd, type ChangeBy, type Figures, type WeeklyReportData } from "@/lib/reports/weekly-logic";
import { PlanActions, ReportSection } from "./report-client";

// Your MAIRO Weekly Report: the week in about two minutes. Every section is a
// view over the report written on delivery day; nothing here recalculates or
// guesses. "clientFacing" is the version an agency shares — MAIRO's internal
// notes and buttons are left out.

export type ReportMode = "simple" | "advanced" | "profit";

const CONF: Record<DecisionConfidence, { label: string; tone: string }> = {
  HIGH: { label: "High confidence", tone: "bg-emerald-400/12 text-emerald-300" },
  MEDIUM: { label: "Medium confidence", tone: "bg-sky-400/12 text-sky-300" },
  EARLY: { label: "Early signal", tone: "bg-amber-400/12 text-amber-300" },
};

function Confidence({ c }: { c: DecisionConfidence }) {
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] ${CONF[c].tone}`}>{CONF[c].label}</span>;
}

/** One figure and its move against last week. `good` says which way is good; spend has no good direction. */
export function WeeklyMetricCard({ label, value, now, before, good, large = false }: { label: string; value: string; now: number | null; before: number | null | undefined; good: "up" | "down" | "neutral"; large?: boolean }) {
  const c = change(now, before);
  const flat = c === null || Math.abs(c) < 0.005;
  const tone = flat || good === "neutral" ? "text-muted" : (good === "up") === c! > 0 ? "text-live" : "text-alert";
  return (
    <div className={`min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] ${large ? "p-5" : "p-4"}`}>
      <p className="truncate text-[12.5px] text-muted">{label}</p>
      <p className={`mt-0.5 truncate font-semibold tabular-nums tracking-tight text-white ${large ? "text-[30px]" : "text-[22px]"}`}>{value}</p>
      <p className={`mt-0.5 text-[12px] tabular-nums ${tone}`}>{c === null ? "No comparison yet" : flat ? "Same as last week" : `${c > 0 ? "+" : "−"}${Math.abs(Math.round(c * 100))}% vs last week`}</p>
    </div>
  );
}

function num(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US");
}

function Glance({ c, p, mode, profitKnown, word }: { c: Figures; p: Figures | null; mode: ReportMode; profitKnown: boolean; word: string }) {
  const W = `${word[0].toUpperCase()}${word.slice(1)}s`;
  if (mode === "profit") {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <WeeklyMetricCard large label="Revenue" value={usd(c.revenueCents, true)} now={c.revenueCents} before={p?.revenueCents} good="up" />
          <WeeklyMetricCard large label="Estimated profit" value={profitKnown ? usd(c.profitCents, true) : "Add your margin"} now={c.profitCents} before={p?.profitCents} good="up" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <WeeklyMetricCard label="Ad spend" value={usd(c.spendCents, true)} now={c.spendCents} before={p?.spendCents} good="neutral" />
          <WeeklyMetricCard label="Customers" value={num(c.results)} now={c.results} before={p?.results} good="up" />
          <WeeklyMetricCard label="Cost per customer" value={usd(c.costPerResultCents)} now={c.costPerResultCents} before={p?.costPerResultCents} good="down" />
          <WeeklyMetricCard label="ROAS" value={c.roas === null ? "—" : `${c.roas.toFixed(1)}x`} now={c.roas} before={p?.roas} good="up" />
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <WeeklyMetricCard label="Ad spend" value={usd(c.spendCents, true)} now={c.spendCents} before={p?.spendCents} good="neutral" />
      <WeeklyMetricCard label="Revenue" value={usd(c.revenueCents, true)} now={c.revenueCents} before={p?.revenueCents} good="up" />
      {profitKnown && <WeeklyMetricCard label="Estimated profit" value={usd(c.profitCents, true)} now={c.profitCents} before={p?.profitCents} good="up" />}
      <WeeklyMetricCard label={W} value={num(c.results)} now={c.results} before={p?.results} good="up" />
      <WeeklyMetricCard label={`Cost per ${word}`} value={usd(c.costPerResultCents)} now={c.costPerResultCents} before={p?.costPerResultCents} good="down" />
      <WeeklyMetricCard label="ROAS" value={c.roas === null ? "—" : `${c.roas.toFixed(1)}x`} now={c.roas} before={p?.roas} good="up" />
      {mode === "advanced" && (
        <>
          <WeeklyMetricCard label="CTR" value={c.ctr === null ? "—" : `${(c.ctr * 100).toFixed(2)}%`} now={c.ctr} before={p?.ctr} good="up" />
          <WeeklyMetricCard label="CPC" value={usd(c.cpcCents)} now={c.cpcCents} before={p?.cpcCents} good="down" />
          <WeeklyMetricCard label="CPM" value={usd(c.cpmCents)} now={c.cpmCents} before={p?.cpmCents} good="down" />
          <WeeklyMetricCard label="Reach" value={num(c.reach)} now={c.reach} before={p?.reach} good="up" />
          <WeeklyMetricCard label="Clicks" value={num(c.clicks)} now={c.clicks} before={p?.clicks} good="up" />
          <WeeklyMetricCard label="Impressions" value={num(c.impressions)} now={c.impressions} before={p?.impressions} good="neutral" />
        </>
      )}
    </div>
  );
}

const BY: Record<ChangeBy, { label: string; tone: string }> = {
  you: { label: "You approved", tone: "bg-white/[0.07] text-white/75" },
  "ai-assist": { label: "AI Assist", tone: "bg-violet/20 text-violet-bright" },
  autopilot: { label: "Autopilot", tone: "bg-sky-400/12 text-sky-300" },
  "spend-protection": { label: "Spend Protection", tone: "bg-amber-400/12 text-amber-300" },
};

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13.5px] text-muted">{children}</p>;
}

export function WeeklyReport({
  data,
  mode,
  pendingDecisionIds,
  clientFacing = false,
  hideInternal = false,
}: {
  data: WeeklyReportData;
  mode: ReportMode;
  pendingDecisionIds: string[];
  clientFacing?: boolean;
  hideInternal?: boolean;
}) {
  const word = data.resultWord;
  const internal = !(clientFacing && hideInternal);
  const fixHref = (decisionId: string | null, action: { href: string } | null) =>
    decisionId && pendingDecisionIds.includes(decisionId) ? "/dashboard/decisions" : (action?.href ?? "/dashboard/decisions");

  return (
    <div className="space-y-4">
      {data.dataNote && <p className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3 text-[13px] text-amber-200">{data.dataNote}</p>}

      {data.mission && (
        <section className="rounded-2xl border border-violet/30 bg-violet/[0.05] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Your week with MAIRO</p>
          <h2 className="mt-1 text-[19px] font-semibold text-white">🎯 Goal: {data.mission.goal}</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-semibold text-white">What MAIRO did</h3>
              <ul className="mt-1.5 space-y-1 text-[13.5px] text-white/85">{data.mission.did.map((d) => <li key={d}>• {d}</li>)}</ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-white">Results</h3>
              <ul className="mt-1.5 space-y-1 text-[13.5px] text-white/85">
                {data.mission.results.map((r) => <li key={r.label}>• {r.label}: <span className={r.value ? "font-semibold tabular-nums text-white" : "text-faint"}>{r.value ?? "not tracked yet"}</span></li>)}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-white">What MAIRO learned</h3>
              <p className="mt-1.5 text-[13.5px] text-white/85">{data.mission.learned ? `“${data.mission.learned}”` : "Not enough results yet to draw a conclusion."}</p>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-white">Next week&rsquo;s plan</h3>
              <p className="mt-1.5 text-[13.5px] text-white/85">{data.mission.next}</p>
            </div>
          </div>
        </section>
      )}

      <ReportSection title="Week at a glance" eyebrow={data.period.label}>
        <Glance c={data.glance.current} p={data.glance.previous} mode={mode} profitKnown={data.glance.profitKnown} word={word} />
      </ReportSection>

      <section className="rounded-2xl border border-violet/30 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(124,92,255,0.16),transparent_55%),var(--color-field)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-bright">MAIRO summary</p>
        <p className="mt-2 text-[15.5px] leading-relaxed text-white/90">{mode === "advanced" ? data.summary.advanced : data.summary.simple}</p>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportSection title="Your biggest win" eyebrow="Biggest win">
          {data.win ? (
            <div>
              <p className="text-[16px] font-semibold text-white">
                {data.win.label} <span className="font-normal text-muted">in {data.win.campaignName}</span>
              </p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
                <div className="rounded-lg bg-white/[0.03] px-3 py-2"><dt className="text-faint">Revenue</dt><dd className="font-semibold tabular-nums text-white">{usd(data.win.revenueCents, true)}</dd></div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2"><dt className="text-faint">Cost per {word}</dt><dd className="font-semibold tabular-nums text-white">{usd(data.win.costPerResultCents)}</dd></div>
                <div className="rounded-lg bg-white/[0.03] px-3 py-2"><dt className="text-faint">ROAS</dt><dd className="font-semibold tabular-nums text-white">{data.win.roas === null ? "—" : `${data.win.roas.toFixed(1)}x`}</dd></div>
              </dl>
              <p className="mt-3 text-[12px] font-semibold uppercase tracking-[0.1em] text-violet-bright">Why it worked</p>
              <ul className="mt-1 space-y-1 text-[13.5px] text-white/85">
                {data.win.why.map((w) => <li key={w}>• {w}</li>)}
              </ul>
              {internal && (
                <p className="mt-3 rounded-lg bg-violet/10 p-3 text-[13px] text-white/85">
                  <span className="font-semibold text-violet-bright">What MAIRO learned: </span>
                  {data.win.learned}
                </p>
              )}
            </div>
          ) : (
            <Empty>{data.winNote}</Empty>
          )}
        </ReportSection>

        <ReportSection title="What needs attention" eyebrow="Needs attention">
          {data.attention.length === 0 ? (
            <Empty>No major issues detected this week.</Empty>
          ) : (
            <ul className="space-y-3">
              {data.attention.map((a) => (
                <li key={a.insightId} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                  <p className="text-[14.5px] font-semibold text-white">{a.title}</p>
                  {a.metric && a.now && (
                    <p className="mt-1 text-[13px] tabular-nums text-white/80">
                      {a.metric}: {a.before ? `${a.before} → ` : ""}
                      {a.now}
                    </p>
                  )}
                  <p className="mt-1 text-[13px] text-muted">{mode === "advanced" ? a.happenedAdvanced : a.happened}</p>
                  <p className="mt-1.5 text-[13px] text-white/80"><span className="text-violet-bright">MAIRO&rsquo;s read:</span> {a.interpretation}</p>
                  <p className="mt-1 text-[13px] text-white/80"><span className="text-violet-bright">Recommended:</span> {a.recommendation}</p>
                  {!clientFacing && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={fixHref(a.decisionId, a.action)} className="inline-flex min-h-[38px] items-center rounded-lg bg-[#7c5cff] px-3.5 text-[12.5px] font-medium text-white hover:brightness-110">
                        Fix with MAIRO →
                      </Link>
                      <Link
                        href={`/dashboard/agents?ask=${encodeURIComponent(`Why is this happening: "${a.title}"?`)}${a.campaignId ? `&about=${a.campaignId}` : ""}`}
                        className="inline-flex min-h-[38px] items-center rounded-lg border border-white/12 px-3.5 text-[12.5px] text-white/85 hover:border-white/30"
                      >
                        Ask MAIRO why
                      </Link>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ReportSection>
      </div>

      <ReportSection title="What MAIRO changed" eyebrow="This week">
        {data.changes.length === 0 ? (
          <Empty>MAIRO didn&rsquo;t change anything this week.</Empty>
        ) : (
          <ol className="space-y-3">
            {data.changes.map((c, i) => (
              <li key={`${c.at}-${i}`} className="flex gap-4">
                <span className="w-20 shrink-0 pt-0.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">
                  {new Date(c.at).toLocaleDateString("en-US", { weekday: "long" })}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-white">
                    {c.title}
                    {internal && <span className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${BY[c.by].tone}`}>{BY[c.by].label}</span>}
                  </p>
                  <p className="text-[13px] text-white/80">{c.summary}</p>
                  {(c.before || c.after) && <p className="text-[12.5px] tabular-nums text-muted">{c.before} → {c.after}</p>}
                  <p className="text-[12.5px] text-muted">Reason: {c.reason}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
        {!clientFacing && (
          <Link href="/dashboard/activity" className="mt-4 inline-block text-[13px] text-violet-bright hover:text-white">
            View full activity →
          </Link>
        )}
      </ReportSection>

      {internal && (
        <ReportSection title="What MAIRO learned" eyebrow="Learning Memory">
          {data.learnings.length === 0 ? (
            <Empty>Nothing strong enough to call a lesson this week — MAIRO only saves what the numbers clearly support.</Empty>
          ) : (
            <ol className="space-y-3">
              {data.learnings.map((l, i) => (
                <li key={l.key} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                  <p className="text-[14.5px] font-semibold text-white">{i + 1}. {l.statement}</p>
                  <p className="mt-1 text-[13px] text-muted">{l.detail}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Confidence c={l.confidence} />
                    <span className="text-[12px] text-faint">{l.saved ? "Saved to Learning Memory — future ads will use it" : "Not saved yet — needs more data"}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </ReportSection>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReportSection title="Platform performance" eyebrow="Facebook & Instagram" detail>
          {!data.platforms ? (
            <Empty>Meta didn&rsquo;t split this week by app.</Empty>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.platforms.rows.map((r) => (
                  <div key={r.name} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-violet-bright">{r.name}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                      <dt className="text-faint">Spend</dt><dd className="text-right tabular-nums text-white">{usd(r.spendCents, true)}</dd>
                      <dt className="text-faint">Revenue</dt><dd className="text-right tabular-nums text-white">{usd(r.revenueCents, true)}</dd>
                      <dt className="text-faint">Cost per {word}</dt><dd className="text-right tabular-nums text-white">{usd(r.costPerResultCents)}</dd>
                      <dt className="text-faint">ROAS</dt><dd className="text-right tabular-nums text-white">{r.roas === null ? "—" : `${r.roas.toFixed(1)}x`}</dd>
                    </dl>
                  </div>
                ))}
              </div>
              {data.platforms.note && <p className="mt-3 text-[13.5px] text-white/80"><span className="text-violet-bright">MAIRO&rsquo;s read:</span> {data.platforms.note}</p>}
            </>
          )}
        </ReportSection>

        <ReportSection title="Creative performance" eyebrow="Your ads" detail>
          {data.creatives.note ? (
            <Empty>{data.creatives.note}</Empty>
          ) : (
            <ul className="space-y-2.5">
              {([["Top creative", data.creatives.top, "text-emerald-300"], ["Emerging creative", data.creatives.emerging, "text-sky-300"], ["Losing momentum", data.creatives.losing, "text-amber-300"]] as const).map(([k, v, tone]) => (
                <li key={k} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.02] px-3 py-2.5">
                  <span className={`text-[12px] font-semibold uppercase tracking-[0.08em] ${tone}`}>{k}</span>
                  <span className="text-right text-[13px]">
                    {v ? (
                      <>
                        <span className="block text-white">{v.label} <span className="text-muted">· {v.campaignName}</span></span>
                        <span className="block text-[12px] text-faint">{v.note}</span>
                      </>
                    ) : (
                      <span className="text-faint">Not enough data yet</span>
                    )}
                  </span>
                </li>
              ))}
              {data.creatives.bestFormat && <li className="text-[13px] text-white/80">Best format: <span className="text-white">{data.creatives.bestFormat}</span></li>}
              {data.creatives.bestPlacement && <li className="text-[13px] text-white/80">Best placement: <span className="text-white">{data.creatives.bestPlacement}</span></li>}
            </ul>
          )}
          {!clientFacing && (
            <Link href="/dashboard/creatives" className="mt-3 inline-block text-[13px] text-violet-bright hover:text-white">
              View creative breakdown →
            </Link>
          )}
        </ReportSection>

        <ReportSection title="Budget summary" eyebrow="Where the money went" detail>
          <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
            <div className="rounded-lg bg-white/[0.03] px-3 py-2"><dt className="text-faint">Weekly budget</dt><dd className="font-semibold tabular-nums text-white">{usd(data.budget.plannedCents, true)}</dd></div>
            <div className="rounded-lg bg-white/[0.03] px-3 py-2"><dt className="text-faint">Actual spend</dt><dd className="font-semibold tabular-nums text-white">{usd(data.budget.spentCents, true)}</dd></div>
            <div className="rounded-lg bg-white/[0.03] px-3 py-2"><dt className="text-faint">Remaining</dt><dd className="font-semibold tabular-nums text-white">{usd(data.budget.remainingCents, true)}</dd></div>
          </dl>
          {data.budget.utilization !== null && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#7c5cff] to-[#a78bfa]" style={{ width: `${Math.min(100, data.budget.utilization * 100)}%` }} />
            </div>
          )}
          {(data.budget.byPlacement.length > 0 || data.budget.testingCents) && (
            <ul className="mt-3 space-y-1 text-[13px]">
              {data.budget.byPlacement.map((b) => (
                <li key={b.name} className="flex justify-between"><span className="text-muted">{b.name} spend</span><span className="tabular-nums text-white">{usd(b.spendCents, true)}</span></li>
              ))}
              {data.budget.testingCents && <li className="flex justify-between"><span className="text-muted">Testing spend</span><span className="tabular-nums text-white">{usd(data.budget.testingCents, true)}</span></li>}
            </ul>
          )}
          <p className="mt-3 text-[13px] text-white/80">{data.budget.note}</p>
          <p className="mt-1 text-[11.5px] text-faint">Weekly budget is today&rsquo;s daily budgets × 7.</p>
        </ReportSection>

        <ReportSection title="Business health change" eyebrow="Business Health" detail>
          {!data.health.now ? (
            <Empty>Business Health needs a few days of results first.</Empty>
          ) : (
            <>
              <div className="flex items-baseline gap-6">
                <div><p className="text-[12px] text-faint">Last week</p><p className="text-[26px] font-semibold tabular-nums text-white/70">{data.health.before?.score ?? "—"}</p></div>
                <div><p className="text-[12px] text-faint">This week</p><p className="text-[26px] font-semibold tabular-nums text-white">{data.health.now.score ?? "—"}</p></div>
              </div>
              <ul className="mt-3 space-y-1.5 text-[13px]">
                {data.health.now.areas.map((a) => {
                  const b = data.health.before?.areas.find((x) => x.key === a.key)?.score ?? null;
                  const d = a.score !== null && b !== null ? a.score - b : null;
                  return (
                    <li key={a.key} className="flex justify-between">
                      <span className="text-muted">{a.label}</span>
                      <span className={`tabular-nums ${d === null || d === 0 ? "text-white/70" : d > 0 ? "text-live" : "text-alert"}`}>
                        {a.score ?? "—"}
                        {d !== null && d !== 0 && ` (${d > 0 ? "+" : "−"}${Math.abs(d)})`}
                        {d === 0 && " (no change)"}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {!data.health.before && <p className="mt-2 text-[12px] text-faint">First report — next week shows the change.</p>}
            </>
          )}
        </ReportSection>
      </div>

      <ReportSection title="MAIRO's plan for next week" eyebrow="Next week">
        {data.plan.length === 0 ? (
          <Empty>Nothing needs changing — MAIRO will keep watching and tell you if that changes.</Empty>
        ) : (
          <ol className="space-y-3">
            {data.plan.map((p, i) => (
              <li key={`${p.title}-${i}`} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] ${p.priority === "High" ? "bg-alert/12 text-alert" : p.priority === "Medium" ? "bg-amber-400/12 text-amber-300" : "bg-white/[0.07] text-white/70"}`}>
                    {p.priority} priority
                  </span>
                  <Confidence c={p.confidence} />
                </div>
                <p className="mt-2 text-[14.5px] font-semibold text-white">{i + 1}. {p.action}</p>
                <p className="mt-1 text-[13px] text-muted"><span className="text-white/80">Why:</span> {p.reason}</p>
                <p className="mt-0.5 text-[13px] text-muted"><span className="text-white/80">Purpose:</span> {p.purpose}</p>
                {!clientFacing && (
                  <Link href={p.href} className="mt-2 inline-block text-[12.5px] text-violet-bright hover:text-white">
                    {p.decisionId && !pendingDecisionIds.includes(p.decisionId) ? "Already handled — see Decisions →" : `${p.actionLabel} →`}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-[12px] text-faint">MAIRO recommends testing these because the signals above suggest they may help — no change is certain to improve results.</p>
        {!clientFacing && data.plan.length > 0 && <PlanActions plan={data.plan} pending={pendingDecisionIds} />}
      </ReportSection>
    </div>
  );
}

/** The report's heading, with an agency's branding when it's a client version. */
export function ReportHeader({ data, brandName, brandLogoUrl, clientName }: { data: WeeklyReportData; brandName?: string | null; brandLogoUrl?: string | null; clientName?: string | null }) {
  return (
    <header className="mb-5">
      {(brandName || brandLogoUrl) && (
        <div className="mb-4 flex items-center gap-3">
          {brandLogoUrl && <img src={brandLogoUrl} alt={brandName ?? "Agency logo"} className="h-9 w-auto max-w-[160px] rounded object-contain" />}
          {brandName && <span className="text-[14px] font-semibold text-white">{brandName}</span>}
        </div>
      )}
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-bright">{clientName ? `${clientName} · ` : ""}{data.period.label}</p>
      <h1 className="mt-1.5 text-[clamp(24px,3vw,32px)] font-semibold tracking-[-0.02em] text-white">{clientName ? `${clientName}'s weekly report` : "Your MAIRO Weekly Report"}</h1>
      <p className="mt-1 text-[14.5px] text-muted">Here&rsquo;s what happened with your advertising this week.</p>
    </header>
  );
}
