import type { StrategyContent } from "@/lib/strategy/plan-logic";
import { PlanNumbers } from "./plan-numbers";
import { economicsFitGoal } from "@/lib/calc/assumptions";
import { channelAdvice, creativeDirections, factsAndAssumptions, landingIssues, testingSchedule, trackingNeeds, type FactInput, type TrackingContext } from "@/lib/strategy/plan-guide";

// The parts of the free plan that follow from facts: where to advertise and
// why one place, what the plan rests on (and what it had to assume), three
// creative directions, the landing page's problems, the tracking the campaign
// needs, and when to test what. Server-rendered from the plan as it stands, so
// it changes the moment the plan does.

const card = "rounded-2xl border border-white/[0.08] bg-field/80 p-5";
const h = "text-[11.5px] font-semibold uppercase tracking-[0.16em] text-faint";

const STATUS_TONE: Record<string, string> = {
  "in place": "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300",
  needed: "border-amber-400/35 bg-amber-400/[0.08] text-amber-200",
  "not needed": "border-white/15 bg-white/[0.04] text-white/70",
};

export function PlanGuide({ plan, facts, tracking, siteIssues }: { plan: StrategyContent; facts: FactInput; tracking: TrackingContext; siteIssues: { issue: string; fix: string; severity?: "high" | "medium" | "low" }[] }) {
  const channel = channelAdvice(plan);
  const { facts: known, assumptions } = factsAndAssumptions(plan, facts);
  const directions = creativeDirections(plan);
  const issues = landingIssues(plan, siteIssues);
  const needs = trackingNeeds(plan, tracking);
  const schedule = testingSchedule(plan, facts.economics ?? null);

  return (
    <div className="mt-8 space-y-4" aria-label="How this plan works">
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card} aria-labelledby="g-channel">
          <h2 id="g-channel" className={h}>Recommended channel and objective</h2>
          <p className="mt-2 text-[16px] font-semibold text-white">{channel.channel}</p>
          <p className="mt-1 text-[14px] text-white/85">{channel.objective}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{channel.objectiveWhy}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{channel.focusWhy}</p>
          <p className="mt-2 text-[12px] text-faint">{channel.notOffered}</p>
        </section>

        <section className={card} aria-labelledby="g-basis">
          <h2 id="g-basis" className={h}>What this plan is built on</h2>
          {known.length > 0 && (
            <dl className="mt-3 space-y-2">
              {known.map((f) => (
                <div key={f.label}>
                  <dt className="text-[12px] text-faint">{f.label} · <span className="text-white/60">{f.source}</span></dt>
                  <dd className="text-[13.5px] text-white">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {assumptions.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3">
              <p className="text-[13px] font-medium text-white">MAIRO had to assume</p>
              <ul className="mt-1.5 space-y-1.5 text-[12.5px] text-white/80">
                {assumptions.map((a) => (
                  <li key={a.label}>
                    <span className="text-white">{a.label}:</span> {a.assumed}{" "}
                    <a href={a.href} className="text-violet-bright underline underline-offset-2 hover:text-white">{a.fix}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <PlanNumbers stored={!facts.economics ? "none" : economicsFitGoal(facts.economics, plan.goal) ? "used" : "other-goal"} goal={plan.goal} />
        </section>
      </div>

      <section className={card} aria-labelledby="g-directions">
        <h2 id="g-directions" className={h}>Three creative directions</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-3">
          {directions.map((d, i) => (
            <li key={d.title} className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-[12px] font-semibold text-violet-bright">Direction {i + 1} · {d.format}</p>
              <p className="mt-1 text-[14.5px] font-semibold text-white">{d.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/75">{d.angle}</p>
              {d.hook && <p className="mt-2 text-[12.5px] text-muted">Opening line: &ldquo;{d.hook}&rdquo;</p>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12px] text-faint">After you subscribe, the Creative Studio writes full ads for each direction — hook, text and button — and checks them against your brand rules.</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={card} aria-labelledby="g-tracking">
          <h2 id="g-tracking" className={h}>Tracking this campaign needs</h2>
          <ul className="mt-3 space-y-3">
            {needs.map((n) => (
              <li key={n.what}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-white">{n.what}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[n.status]}`}>{n.status}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{n.why}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={card} aria-labelledby="g-landing">
          <h2 id="g-landing" className={h}>Landing page</h2>
          {issues.length ? (
            <ul className="mt-3 space-y-2.5">
              {issues.map((i) => (
                <li key={i.issue} className="text-[13px] leading-relaxed text-white/85">
                  {i.issue}
                  {i.fix && <span className="block text-[12.5px] text-muted">Fix: {i.fix}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[13px] text-muted">No problems found with the page your ads will send people to{facts.pagesRead.length ? "" : " — MAIRO hasn't read a website for this plan"}.</p>
          )}
        </section>
      </div>

      <section className={card} aria-labelledby="g-testing">
        <h2 id="g-testing" className={h}>Suggested testing schedule</h2>
        <ol className="mt-3 grid gap-3 md:grid-cols-4">
          {schedule.map((t) => (
            <li key={t.when} className="rounded-xl border border-white/[0.07] p-4">
              <p className="text-[12px] font-semibold text-violet-bright">{t.when}</p>
              <p className="mt-1 text-[13.5px] text-white">{t.what}</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{t.why}</p>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[12px] text-faint">No plan can promise a number of leads, sales or returns. This one says how you&rsquo;ll find out what works.</p>
      </section>
    </div>
  );
}
