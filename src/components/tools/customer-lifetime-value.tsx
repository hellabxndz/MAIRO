"use client";

import { CURRENCIES, currencySymbol, lifetimeContribution, money, num, type Currency } from "@/lib/calc/economics";
import { CopyButton, ExampleBadge, ExampleButton, NextStep, Notes, NumberField, Panel, Problems, ResultPanel, SelectField, Stat, useLocalState } from "./ui";

type S = { currency: Currency; contributionPerOrder: number | null; ordersPerYear: number | null; years: number | null; retentionPct: number | null; reserve: number | null; example: boolean };
const EMPTY: S = { currency: "USD", contributionPerOrder: null, ordersPerYear: null, years: 2, retentionPct: null, reserve: null, example: false };
const EXAMPLE: S = { currency: "USD", contributionPerOrder: 25, ordersPerYear: 3, years: 2, retentionPct: 40, reserve: 15, example: true };

export function LifetimeTool() {
  const [s, setS] = useLocalState<S>("customer-lifetime-value", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const sym = currencySymbol(s.currency);
  const m = (n: number | null) => money(n, s.currency);
  const r = lifetimeContribution(s);
  const summary = r.ok ? `Lifetime contribution over ${s.years} year(s): ${m(r.value.lifetimeContribution)} (${num(r.value.expectedOrders, 1)} orders). Most to pay per new customer, keeping ${m(s.reserve ?? 0)}: ${m(r.value.maxAcquisitionCost)}.` : "";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">A typical customer<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectField label="Currency" value={s.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <NumberField label="Contribution per order" hint="Order value minus its own costs — not revenue. The break-even calculator works it out." value={s.contributionPerOrder} onChange={(v) => set({ contributionPerOrder: v })} prefix={sym} />
          <NumberField label="Orders per customer per year" value={s.ordersPerYear} onChange={(v) => set({ ordersPerYear: v })} step="0.1" />
          <NumberField label="Years to count" hint="Only these years are included. 1–10." value={s.years} onChange={(v) => set({ years: v })} step="1" min={1} max={10} />
          <NumberField label="Customers still buying a year later" hint="Your own figure or estimate." value={s.retentionPct} onChange={(v) => set({ retentionPct: v })} suffix="%" />
          <NumberField label="Profit to keep per customer (optional)" value={s.reserve} onChange={(v) => set({ reserve: v })} prefix={sym} placeholder="0" />
        </div>
      </Panel>
      <div className="space-y-5">
        {!r.ok ? (
          <Problems problems={r.problems} />
        ) : (
          <ResultPanel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat strong label="Lifetime contribution" value={m(r.value.lifetimeContribution)} sub={`About ${num(r.value.expectedOrders, 1)} orders over ${s.years} year${s.years === 1 ? "" : "s"}`} />
              <Stat strong label="Most to pay to win a customer" value={m(r.value.maxAcquisitionCost)} sub={r.value.maxAcquisitionCost === null ? "Your reserve uses it all up." : (s.reserve ?? 0) > 0 ? `Keeping ${m(s.reserve ?? 0)} each.` : "Break-even — nothing left over."} />
            </div>
            <table className="mt-4 w-full text-left text-[13px]">
              <thead><tr className="text-white/60"><th className="py-1.5 font-medium">Year</th><th className="py-1.5 font-medium">Orders per customer</th><th className="py-1.5 font-medium">Contribution</th></tr></thead>
              <tbody className="text-white/85">
                {r.value.byYear.map((y) => (
                  <tr key={y.year} className="border-t border-white/[0.06]"><td className="py-1.5">{y.year}</td><td className="py-1.5">{num(y.orders, 2)}</td><td className="py-1.5">{m(y.contribution)}</td></tr>
                ))}
              </tbody>
            </table>
            <Notes notes={r.notes} />
            <div className="mt-4"><CopyButton text={summary} label="Copy result" /></div>
          </ResultPanel>
        )}
        {r.ok && r.value.maxAcquisitionCost !== null && (
          <NextStep
            title="Judge ads by what a customer is worth"
            body="Your free plan can use this as the most a new customer may cost — paying more than one sale returns only makes sense if they really come back."
            action="Use this in my free plan"
            handoff={{ kind: "note", tool: "customer-lifetime-value", label: "Customer value from the lifetime calculator", text: summary }}
          />
        )}
      </div>
    </div>
  );
}
