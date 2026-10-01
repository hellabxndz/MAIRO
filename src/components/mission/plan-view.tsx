import type { MissionPlan } from "@/lib/mission/planner";
import { CUSTOMER_ACTIONS, missionGoal } from "@/lib/mission/goals";

// "MAIRO created a plan": what MAIRO will do, why, and how — in plain words.
// The tactics are MAIRO's decisions; they're shown so nothing is hidden, not
// so the owner has to understand them.

const card = "rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5";

export function PlanView({ plan, showTactics = true }: { plan: MissionPlan; showTactics?: boolean }) {
  const action = CUSTOMER_ACTIONS.find((a) => a.key === plan.tactics.customerAction)?.label ?? "";
  // The Strategy Engine's view, on plans made since it existed.
  const e = plan.engine;
  return (
    <div className="space-y-4">
      <section className={card}>
        <dl className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
          <dt className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Goal</dt>
          <dd className="text-[16px] font-semibold text-white">
            {missionGoal(plan.goal).label}{plan.focusItem ? ` — ${plan.focusItem}` : ""}
            {plan.chosenGoal === "RECOMMEND" && <span className="ml-2 text-[12.5px] font-normal text-muted">(MAIRO&rsquo;s recommendation for your business)</span>}
            {plan.secondaryGoal && <span className="mt-1 block text-[13px] font-normal text-muted">Secondary: {missionGoal(plan.secondaryGoal).label}</span>}
          </dd>
          {e && (
            <>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">What MAIRO understood</dt>
              <dd>
                <ul aria-label="What MAIRO understood" className="flex flex-wrap gap-1.5">
                  {[
                    ["Goal", e.objective.goalLabel],
                    ["Customers should", e.objective.desiredAction],
                    ["Industry", e.objective.industry],
                    ["Intent", e.objective.intent],
                    ["Focus", e.objective.marketingFocus],
                  ].map(([k, v]) => (
                    <li key={k} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[12.5px] text-white/85">
                      <span className="text-faint">{k}: </span>{v}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
          <dt className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Strategy</dt>
          <dd className="text-[14.5px] leading-relaxed text-white/90">
            {plan.strategy}
            {e && <span className="mt-1 block text-[13px] text-muted">{e.statement}</span>}
          </dd>
          <dt className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Why</dt>
          <dd className="text-[14px] leading-relaxed text-white/80">{plan.why}</dd>
          <dt className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">MAIRO will focus on</dt>
          <dd>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {plan.focus.map((f) => (
                <li key={f} className="flex gap-2 text-[14px] text-white/85"><span aria-hidden className="text-emerald-300">✓</span>{f}</li>
              ))}
            </ul>
          </dd>
          {e && (
            <>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">How sure MAIRO is</dt>
              <dd className="text-[13.5px] text-white/80">
                <ConfidenceText level={e.confidence.level} text={e.confidence.customer} />
                {e.learningsApplied.length > 0 && <span className="mt-1 block text-[13px] text-emerald-200/90">From your results: {e.learningsApplied.join(" ")}</span>}
              </dd>
            </>
          )}
          {plan.secondaryNote && (
            <>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Second goal</dt>
              <dd className="text-[13.5px] text-white/80">{plan.secondaryNote}</dd>
            </>
          )}
        </dl>
      </section>

      <section className={card}>
        <h3 className="text-[15px] font-semibold text-white">The ads MAIRO will make</h3>
        <p className="text-[12.5px] text-muted">Each one has a job. You&rsquo;ll see the finished ads before anything launches.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {plan.adConcepts.map((c) => (
            <article key={c.name} className="rounded-xl bg-white/[0.03] p-4">
              <p className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-medium text-white">{c.name}</span>
                <span className="shrink-0 rounded-full bg-violet/[0.15] px-2 py-0.5 text-[11px] text-violet-bright">{c.objective}</span>
              </p>
              <p className="mt-1 text-[12px] uppercase tracking-[0.12em] text-faint">{c.format === "VIDEO" ? "Video" : c.format === "CAROUSEL" ? "Carousel" : "Image"} · {c.cta}</p>
              {c.headline && <p className="mt-2 text-[13.5px] font-medium text-white/90">{c.headline}</p>}
              <p className="mt-2 rounded-lg bg-violet/[0.07] px-3 py-2 text-[12.5px] leading-relaxed text-white/80">
                <span className="font-semibold text-violet-bright">Why MAIRO created this ad: </span>{c.why}
              </p>
            </article>
          ))}
        </div>
      </section>

      {e && (
        <section className={card}>
          <h3 className="text-[15px] font-semibold text-white">Recommended budget</h3>
          <p className="mt-1 text-[13.5px] text-white/85">{e.budget.summary}</p>
          <ul className="mt-3 space-y-2.5" aria-label="Budget split">
            {e.budget.allocation.map((a) => (
              <li key={a.purpose}>
                <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="text-white/90">{a.purpose}</span>
                  <span className="tabular-nums text-white">{a.percent}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-white/[0.06]"><div className="h-1.5 rounded-full bg-violet-400/80" style={{ width: `${a.percent}%` }} /></div>
                <p className="mt-1 text-[12px] text-muted">{a.why}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-faint">About ${Math.round(e.budget.dailyCents / 100)}/day. {e.budget.note}</p>
        </section>
      )}

      {e?.launch && (
        <section className={card}>
          <h3 className="text-[15px] font-semibold text-white">Launch stages</h3>
          <p className="text-[12.5px] text-muted">Not every launch needs every stage. MAIRO picked these for yours.</p>
          <ol className="mt-3 space-y-2">
            {e.launch.map((st) => (
              <li key={st.stage} className={`flex gap-3 text-[13.5px] ${st.include ? "" : "opacity-60"}`}>
                <span aria-hidden className={st.include ? "text-emerald-300" : "text-faint"}>{st.include ? "✓" : "–"}</span>
                <span className="min-w-0"><span className="font-medium text-white">{st.stage}</span>{!st.include && <span className="text-faint"> (skipped)</span>} <span className="text-white/70">— {st.reason}</span></span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {e?.promotion && (
        <section className={card}>
          <h3 className="text-[15px] font-semibold text-white">How MAIRO handles the promotion</h3>
          <ul className="mt-2 space-y-1.5 text-[13.5px] text-white/85">
            <li>{e.promotion.introduce}</li>
            <li>Mentioned about {e.promotion.mentionsPerWeek}× a week, so it doesn&rsquo;t drown out everything else.</li>
            <li>{e.promotion.adsChange.why}</li>
            <li>{e.promotion.newCreatives.why}</li>
            <li>{e.promotion.urgency.length ? `Urgency only at the end: ${e.promotion.urgency.map((u) => `"${u.message}" on ${u.date}`).join(", ")}.` : "No countdown — there's no end date to count down to."}</li>
            {e.promotion.restraint && <li className="text-amber-200/90">{e.promotion.restraint}</li>}
          </ul>
        </section>
      )}

      <section className={card}>
        <h3 className="text-[15px] font-semibold text-white">Social media</h3>
        {plan.scale && plan.organic ? (
          <p className="mt-1 text-[14px] text-white/85">{plan.organic}</p>
        ) : (
          <p className="mt-1 text-[13.5px] text-muted">Organic posting on your own Instagram and Facebook comes with MAIRO Scale (Social Manager). Your ads run either way.</p>
        )}
      </section>

      {plan.timeline.length > 0 && (
        <section className={card}>
          <h3 className="text-[15px] font-semibold text-white">Launch timeline</h3>
          <ol className="mt-3 space-y-2">
            {plan.timeline.map((t, i) => (
              <li key={`${t.when}-${i}`} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3 text-[13.5px]">
                <span className="tabular-nums text-faint">{t.when}</span>
                <span className="text-white/90">{t.what}</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11.5px] text-white/60">{t.channel === "Social" && !plan.scale ? "Ads" : t.channel}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {showTactics && (
        <details className={card}>
          <summary className="cursor-pointer text-[14px] font-medium text-white">How MAIRO will run it (you don&rsquo;t need to decide any of this)</summary>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-[13.5px] md:grid-cols-2">
            {[
              ["What customers will do", `${action}. ${plan.adSetup.note}`],
              ["Who sees it", plan.tactics.audience],
              ["Creative", plan.tactics.creative],
              ["Message", plan.tactics.messaging],
              ["Call to action", plan.tactics.cta],
              ["Budget", plan.tactics.budget],
              ["Channels", plan.tactics.channels],
              ["How often", plan.tactics.frequency],
              ["Promotion", plan.tactics.promotion],
              ["Retargeting", plan.tactics.retargeting],
              ["Testing", plan.tactics.testing],
              ["Improving it", plan.tactics.optimization],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">{k}</dt>
                <dd className="mt-0.5 text-white/85">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[12px] text-faint">Prefer to set things yourself? Every setting stays editable in Create and Campaigns.</p>
        </details>
      )}
    </div>
  );
}

/** How sure MAIRO is, in words. Never a percentage. */
export function ConfidenceText({ level, text }: { level: "low" | "medium" | "high"; text: string }) {
  const dot = level === "high" ? "bg-emerald-400" : level === "medium" ? "bg-sky-400" : "bg-amber-300";
  return (
    <span className="inline-flex items-start gap-2">
      <span aria-hidden className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span>{text}</span>
    </span>
  );
}
