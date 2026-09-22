"use client";

import { inputClass } from "@/components/ui";
import { recommendAllocation } from "@/lib/budget/allocation";
import { DAILY_PRESETS, dollars, plannedSpend, type CampaignPlan } from "@/lib/campaigns/plan";
import { Choice, DateChoice, Note, Question, SubQuestion } from "./wizard-parts";

/** Meta's share MAIRO suggests for a Meta + TikTok campaign with this goal. */
export function recommendedMetaPercent(plan: CampaignPlan): number {
  if (!plan.goal) return 60;
  return recommendAllocation(["META", "TIKTOK"], plan.goal, 10000).find((a) => a.platform === "META")?.percent ?? 60;
}

/** Step 4 — how much, split how, and for how long. */
export function StepBudget({
  plan,
  update,
}: {
  plan: CampaignPlan;
  update: (patch: Partial<CampaignPlan>) => void;
}) {
  const spend = plannedSpend(plan);
  const preset = (DAILY_PRESETS as readonly number[]).includes(plan.dailyAmount);
  const networks = plan.service === "meta" ? "Meta" : plan.service === "tiktok" ? "TikTok" : "Meta and TikTok";
  const recommended = recommendedMetaPercent(plan);

  return (
    <Question title="How much would you like to spend on advertising?">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Choice selected={plan.budgetType === "DAILY"} onClick={() => update({ budgetType: "DAILY" })}
          label="Daily budget" sub="The same amount each day, until it stops" />
        <Choice selected={plan.budgetType === "LIFETIME"} onClick={() => update({ budgetType: "LIFETIME", endOnDate: true })}
          label="Total campaign budget" sub="One amount for the whole run, spent by an end date" />
      </div>

      {plan.budgetType === "DAILY" ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {DAILY_PRESETS.map((a) => (
            <button key={a} type="button" aria-pressed={plan.dailyAmount === a} onClick={() => update({ dailyAmount: a })}
              className="rounded-full border px-4 py-2 text-[13px] transition"
              style={{
                borderColor: plan.dailyAmount === a ? "rgba(108,158,255,0.5)" : "var(--mairo-line)",
                background: plan.dailyAmount === a ? "rgba(61,125,255,0.1)" : "transparent",
                color: plan.dailyAmount === a ? "white" : undefined,
              }}>
              ${a} per day
            </button>
          ))}
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <span className={preset ? "" : "text-white"}>Custom</span>
            <span className="text-faint">$</span>
            <input type="number" min={1} step={1} value={plan.dailyAmount} aria-label="Daily budget in dollars"
              onChange={(e) => update({ dailyAmount: Math.max(0, Number(e.target.value) || 0) })} className={`${inputClass} w-24`} />
            <span>/ day</span>
          </label>
        </div>
      ) : (
        <label className="mt-5 flex items-center gap-2 text-[13px] text-muted">
          <span className="text-faint">$</span>
          <input type="number" min={1} step={10} value={plan.lifetimeAmount} aria-label="Total budget in dollars"
            onChange={(e) => update({ lifetimeAmount: Math.max(0, Number(e.target.value) || 0) })} className={`${inputClass} w-32`} />
          <span>in total</span>
        </label>
      )}

      {plan.service === "multi" && (
        <SubQuestion title="How should it be split?" sub={`MAIRO suggests ${recommended}% Meta for this goal. Adjust if you know better.`}>
          <input type="range" min={10} max={90} step={5} value={plan.metaPercent} aria-label="Meta share"
            onChange={(e) => update({ metaPercent: Number(e.target.value) })} className="w-full max-w-md accent-[#6c9eff]" />
          <p className="mt-2 text-[13px] text-white">
            Meta {plan.metaPercent}% · {dollars(Math.round((spend.perDayCents * plan.metaPercent) / 100))}/day &nbsp;·&nbsp;
            TikTok {100 - plan.metaPercent}% · {dollars(spend.perDayCents - Math.round((spend.perDayCents * plan.metaPercent) / 100))}/day
          </p>
          {plan.metaPercent !== recommended && (
            <button type="button" onClick={() => update({ metaPercent: recommended })}
              className="mt-2 text-[12px] text-muted underline underline-offset-4 hover:text-white">
              Use MAIRO&rsquo;s suggestion
            </button>
          )}
        </SubQuestion>
      )}

      <SubQuestion title="When would you like it to run?">
        <div className="grid gap-6 sm:grid-cols-2">
          <DateChoice label="When should it start?" defaultLabel="As soon as approved" pickLabel="Schedule a date"
            picking={plan.startOnDate} onPicking={(startOnDate) => update({ startOnDate })}
            value={plan.startLocal} onChange={(startLocal) => update({ startLocal })} />
          {plan.budgetType === "LIFETIME" ? (
            <div>
              <p className="text-[13px] text-white">When should it end?</p>
              <p className="mt-1 text-[11.5px] text-faint">A total budget is spent by this date, then the campaign stops.</p>
              <input type="datetime-local" value={plan.endLocal} aria-label="When should it end?"
                onChange={(e) => update({ endLocal: e.target.value, endOnDate: true })} className={`${inputClass} mt-2`} />
            </div>
          ) : (
            <DateChoice label="When should it end?" defaultLabel="Run continuously" pickLabel="End on a date"
              picking={plan.endOnDate} onPicking={(endOnDate) => update({ endOnDate })}
              value={plan.endLocal} onChange={(endLocal) => update({ endLocal })} />
          )}
        </div>
        <p className="mt-3 text-[11.5px] text-faint">Times are in your time zone ({plan.timeZone}).</p>
      </SubQuestion>

      <div className="mt-8 grid gap-3">
        <div className="rounded-xl border p-4" style={{ borderColor: "rgba(108,158,255,0.35)", background: "rgba(61,125,255,0.05)" }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Planned spend</p>
          <p className="mt-1.5 text-[15px] text-white">
            {spend.maxCents !== null
              ? `Up to ${dollars(spend.maxCents)} in total${spend.days ? ` over ${spend.days} day${spend.days === 1 ? "" : "s"}` : ""} — about ${dollars(spend.perDayCents)} a day.`
              : `${dollars(spend.perDayCents)} a day — about ${dollars(spend.per30DaysCents)} every 30 days, until you stop it.`}
          </p>
          <p className="mt-1 text-[12px] text-muted">Networks can spend a little over the daily amount on a busy day, but not more than this over the run.</p>
        </div>
        <Note>
          Your Mairo subscription pays for the platform. Your advertising budget is paid to {networks} for delivering
          your advertisements, straight from your own ad account — MAIRO never holds it.
        </Note>
      </div>
    </Question>
  );
}
