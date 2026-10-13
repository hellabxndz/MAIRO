"use client";

import { DAYS_PER_MONTH, LEARNING_EVENTS_PER_WEEK, planBudget } from "@/lib/calc/budget";
import { CURRENCIES, currencySymbol, money, num, type Currency } from "@/lib/calc/economics";
import { Choice, CopyButton, ExampleBadge, ExampleButton, NextStep, Notes, NumberField, Panel, Problems, ResultPanel, SelectField, Stat, useLocalState } from "./ui";

type S = { currency: Currency; period: "daily" | "monthly"; amount: number | null; costPerResult: number | null; example: boolean };
const EMPTY: S = { currency: "USD", period: "monthly", amount: null, costPerResult: null, example: false };
const EXAMPLE: S = { currency: "USD", period: "monthly", amount: 900, costPerResult: 25, example: true };

export function BudgetPlannerTool() {
  const [s, setS] = useLocalState<S>("budget-planner", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const sym = currencySymbol(s.currency);
  const m = (n: number | null) => money(n, s.currency);
  const daily = s.amount == null ? null : s.period === "daily" ? s.amount : s.amount / DAYS_PER_MONTH;
  const r = planBudget({ dailyBudget: daily, costPerResult: s.costPerResult });
  const monthly = r.ok ? r.value.monthly : null;
  const summary = r.ok ? `${m(r.value.daily)}/day (${m(r.value.monthly)}/month): ${r.value.adVersions} ad version(s), ${r.value.audiences} audience(s)${r.value.learning ? `, about ${num(r.value.learning.resultsPerWeek, 1)} results a week at ${m(s.costPerResult)} each` : ""}.` : "";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">Your budget<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectField label="Currency" value={s.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <Choice label="I'm thinking in" value={s.period} onChange={(v) => set({ period: v })} options={[{ value: "monthly", label: "A month" }, { value: "daily", label: "A day" }]} />
          <NumberField label={s.period === "daily" ? "Ad budget per day" : "Ad budget per month"} hint="Paid to Meta, separately from any software." value={s.amount} onChange={(v) => set({ amount: v })} prefix={sym} />
          <NumberField label="What you think one result costs (optional)" hint="A lead, booking or sale. Your estimate — the cost-per-lead calculator helps." value={s.costPerResult} onChange={(v) => set({ costPerResult: v })} prefix={sym} />
        </div>
      </Panel>
      <div className="space-y-5">
        {!r.ok ? (
          <Problems problems={r.problems} />
        ) : (
          <ResultPanel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat strong label="Per day" value={m(r.value.daily)} sub={`About ${m(r.value.monthly)} a month`} />
              <Stat strong label="What it can test" value={`${r.value.adVersions} ad${r.value.adVersions === 1 ? "" : "s"} · ${r.value.audiences} audience${r.value.audiences === 1 ? "" : "s"}`} sub={r.value.retargeting ? "Plus a small retargeting step" : "One campaign"} />
              {r.value.learning && (
                <>
                  <Stat label="Results a week, at your estimate" value={num(r.value.learning.resultsPerWeek, 1)} sub={`Meta's guideline for leaving learning: about ${LEARNING_EVENTS_PER_WEEK} a week.`} />
                  <Stat label="Daily budget for that guideline" value={m(r.value.learning.dailyForGuideline)} sub="Only worth it if each result still pays." />
                </>
              )}
            </div>
            <Notes notes={r.value.advice} tone={r.value.belowMinimum ? "warn" : "neutral"} />
            <div className="mt-4"><CopyButton text={summary} label="Copy result" /></div>
          </ResultPanel>
        )}
        {r.ok && monthly && (
          <NextStep
            title="Get a plan built for this budget"
            body="Your free MAIRO plan splits this budget the same way — and nothing is spent until you approve a campaign."
            action="Use this budget in my plan"
            handoff={{ kind: "budget", tool: "budget-planner", monthlyBudget: Math.round(monthly), label: "From the ad budget planner" }}
          />
        )}
      </div>
    </div>
  );
}
