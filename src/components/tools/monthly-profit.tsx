"use client";

import { CURRENCIES, currencySymbol, money, monthlyOperatingProfit, times, type Currency } from "@/lib/calc/economics";
import { CopyButton, ExampleBadge, ExampleButton, NextStep, Notes, NumberField, Panel, Problems, ResultPanel, SelectField, Stat, useLocalState } from "./ui";

type S = { currency: Currency; revenue: number | null; variableCosts: number | null; adSpend: number | null; fixedCosts: number | null; otherSoftware: number | null; mairoPlan: string; example: boolean };
const EMPTY: S = { currency: "USD", revenue: null, variableCosts: null, adSpend: null, fixedCosts: null, otherSoftware: null, mairoPlan: "none", example: false };
const EXAMPLE: S = { currency: "USD", revenue: 24000, variableCosts: 11000, adSpend: 3000, fixedCosts: 6500, otherSoftware: 120, mairoPlan: "none", example: true };

/** MAIRO's plans come from the same list the pricing cards use, passed in by the page. */
export function MonthlyProfitTool({ plans }: { plans: { id: string; name: string; price: number }[] }) {
  const [s, setS] = useLocalState<S>("monthly-profit", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const sym = currencySymbol(s.currency);
  const m = (n: number | null) => money(n, s.currency);
  const mairo = plans.find((p) => p.id === s.mairoPlan)?.price ?? 0;
  const r = monthlyOperatingProfit({ ...s, softwareFees: (s.otherSoftware ?? 0) + mairo });
  const summary = r.ok ? `Month: sales ${m(s.revenue)}, contribution ${m(r.value.contribution)}, ad spend ${m(s.adSpend)}, fixed ${m(s.fixedCosts)}, software ${m((s.otherSoftware ?? 0) + mairo)} → operating profit ${m(r.value.operatingProfit)} (before tax and anything not entered).` : "";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">One month<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectField label="Currency" value={s.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <NumberField label="Sales in the month" value={s.revenue} onChange={(v) => set({ revenue: v })} prefix={sym} />
          <NumberField label="Costs that rise with sales" hint="Products, materials, delivery, card fees." value={s.variableCosts} onChange={(v) => set({ variableCosts: v })} prefix={sym} />
          <NumberField label="Ad spend" hint="Paid to Meta or other networks." value={s.adSpend} onChange={(v) => set({ adSpend: v })} prefix={sym} />
          <NumberField label="Fixed costs" hint="Rent, wages, insurance — paid whatever you sell." value={s.fixedCosts} onChange={(v) => set({ fixedCosts: v })} prefix={sym} />
          <NumberField label="Other software" value={s.otherSoftware} onChange={(v) => set({ otherSoftware: v })} prefix={sym} placeholder="0" />
          <SelectField
            label="Include a MAIRO plan?"
            value={s.mairoPlan}
            onChange={(v) => set({ mairoPlan: v })}
            options={[{ value: "none", label: "No" }, ...plans.map((p) => ({ value: p.id, label: `${p.name} — $${p.price}/month` }))]}
          />
        </div>
        <p className="mt-3 text-[12px] text-faint">MAIRO&rsquo;s fee and your ad spend are separate bills: the fee goes to MAIRO, ad spend goes to Meta.</p>
      </Panel>
      <div className="space-y-5">
        {!r.ok ? (
          <Problems problems={r.problems} />
        ) : (
          <ResultPanel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat strong label="Operating profit" value={m(r.value.operatingProfit)} sub="Before tax, loan payments and anything not entered." />
              <Stat label="Contribution" value={m(r.value.contribution)} sub="Sales − costs that rise with sales." />
              <Stat label="ROAS this month" value={times(r.value.roas)} sub="Sales ÷ ad spend — all sales, not only those from ads." />
              <Stat label="Ad spend at break-even" value={m(r.value.adSpendAtBreakEven)} sub={r.value.adSpendAtBreakEven === null ? "Contribution doesn't cover fixed costs even with no ads." : "At this month's contribution."} />
            </div>
            <Notes notes={r.notes} tone={r.value.operatingProfit < 0 ? "warn" : "neutral"} />
            <div className="mt-4"><CopyButton text={summary} label="Copy result" /></div>
          </ResultPanel>
        )}
        {r.ok && (
          <NextStep
            title="See what ads need to earn"
            body="Your free MAIRO plan sizes a budget to what your numbers can carry, and shows every cost — MAIRO's fee and ad spend — separately."
            action="Build my free ad plan"
            handoff={{ kind: "note", tool: "monthly-profit", label: "Monthly numbers from the profit calculator", text: summary }}
          />
        )}
      </div>
    </div>
  );
}
