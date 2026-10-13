"use client";

import { adScenario, CURRENCIES, currencySymbol, money, num, saleEconomics, spreadScenario, times, type Currency } from "@/lib/calc/economics";
import { DAYS_PER_MONTH } from "@/lib/calc/budget";
import { CopyButton, ExampleBadge, ExampleButton, NextStep, NumberField, Panel, Problems, ResultPanel, SelectField, secondaryBtn, useLocalState } from "./ui";

type Col = { cpc: number | null; conversionPct: number | null };
type S = { currency: Currency; price: number | null; variableCost: number | null; budget: number | null; base: Col; conservative: Col; optimistic: Col; example: boolean };
const EMPTY: S = { currency: "USD", price: null, variableCost: null, budget: null, base: { cpc: null, conversionPct: null }, conservative: { cpc: null, conversionPct: null }, optimistic: { cpc: null, conversionPct: null }, example: false };
const EXAMPLE: S = { currency: "USD", price: 80, variableCost: 35, budget: 1500, base: { cpc: 1.2, conversionPct: 2 }, conservative: { cpc: 1.5, conversionPct: 1.5 }, optimistic: { cpc: 0.9, conversionPct: 2.5 }, example: true };
const COLS = [
  ["conservative", "Conservative"],
  ["base", "Base"],
  ["optimistic", "Optimistic"],
] as const;

export function AdRoiTool() {
  const [s, setS] = useLocalState<S>("ad-roi", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const sym = currencySymbol(s.currency);
  const m = (n: number | null) => money(n, s.currency);
  const sale = saleEconomics({ price: s.price, productCost: s.variableCost });
  const results = COLS.map(([k, label]) => ({ k, label, col: s[k], r: sale.ok && (s[k].cpc != null || s[k].conversionPct != null) ? adScenario({ budget: s.budget, ...s[k] }, sale.value) : null }));
  const base = results.find((x) => x.k === "base")!.r;
  const canSpread = s.base.cpc != null && s.base.conversionPct != null;
  const summary = results
    .filter((x) => x.r?.ok)
    .map((x) => (x.r && x.r.ok ? `${x.label}: ${num(x.r.value.sales, 1)} sales, ${m(x.r.value.contributionAfterAds)} after ad spend, ROAS ${times(x.r.value.roas)}` : ""))
    .join("\n");

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">Your assumptions<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <p className="mt-1 text-[13px] text-muted">Every number here is your estimate. Nothing is filled in as if it were a fact about your market.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Currency" value={s.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <NumberField label="Price of a sale (or job)" value={s.price} onChange={(v) => set({ price: v })} prefix={sym} />
          <NumberField label="Variable cost per sale" hint="Product, delivery, fees." value={s.variableCost} onChange={(v) => set({ variableCost: v })} prefix={sym} />
          <NumberField label="Ad budget for the period" value={s.budget} onChange={(v) => set({ budget: v })} prefix={sym} />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13.5px]">
            <thead>
              <tr className="text-white/60">
                <th className="py-2 pr-3 font-medium">Scenario</th>
                <th className="py-2 pr-3 font-medium">Cost per click ({sym})</th>
                <th className="py-2 font-medium">Clicks that buy (%)</th>
              </tr>
            </thead>
            <tbody>
              {COLS.map(([k, label]) => (
                <tr key={k} className="border-t border-white/[0.06]">
                  <th scope="row" className="py-2 pr-3 font-medium text-white">{label}{k === "base" ? " · needed" : ""}</th>
                  <td className="py-2 pr-3">
                    <input aria-label={`${label} cost per click`} type="number" inputMode="decimal" min={0} step="any" value={s[k].cpc ?? ""} onChange={(e) => set({ [k]: { ...s[k], cpc: e.target.value === "" ? null : Number(e.target.value) } } as Partial<S>)} className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-violet/70" />
                  </td>
                  <td className="py-2">
                    <input aria-label={`${label} conversion rate`} type="number" inputMode="decimal" min={0} max={100} step="any" value={s[k].conversionPct ?? ""} onChange={(e) => set({ [k]: { ...s[k], conversionPct: e.target.value === "" ? null : Number(e.target.value) } } as Partial<S>)} className="w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-white outline-none focus:border-violet/70" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          disabled={!canSpread}
          className={`${secondaryBtn} mt-3`}
          onClick={() => {
            if (!canSpread) return;
            const sp = spreadScenario({ cpc: s.base.cpc!, conversionPct: s.base.conversionPct! }, 25);
            set({ conservative: sp.conservative, optimistic: sp.optimistic });
          }}
        >
          Fill conservative and optimistic at ±25% of base
        </button>
        <p className="mt-1.5 text-[12px] text-faint">A quick spread, labelled as such. Replace it with your own numbers if you have them.</p>
      </Panel>

      {!sale.ok ? (
        <Problems problems={sale.problems} />
      ) : base && !base.ok ? (
        <Problems problems={base.problems} />
      ) : !base ? (
        <Problems problems={[{ field: "base", message: "Enter a base cost per click and conversion rate." }]} />
      ) : (
        <ResultPanel title="Modeled results — not a forecast">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13.5px]">
              <thead>
                <tr className="text-white/60">
                  <th className="py-2 pr-3 font-medium" />
                  {results.map((x) => <th key={x.k} className="py-2 pr-3 font-medium text-white">{x.label}</th>)}
                </tr>
              </thead>
              <tbody className="text-white/85">
                {([
                  ["Clicks", (v) => num(v.clicks)],
                  ["Sales", (v) => num(v.sales, 1)],
                  ["Revenue", (v) => m(v.revenue)],
                  ["Cost per sale", (v) => m(v.costPerSale)],
                  ["ROAS", (v) => times(v.roas)],
                  ["Left after product costs and ads", (v) => m(v.contributionAfterAds)],
                ] as [string, (v: { clicks: number; sales: number; revenue: number; costPerSale: number | null; roas: number; contributionAfterAds: number }) => string][]).map(([label, f]) => (
                  <tr key={label} className="border-t border-white/[0.06]">
                    <th scope="row" className="py-2 pr-3 font-normal text-white/60">{label}</th>
                    {results.map((x) => <td key={x.k} className={`py-2 pr-3 ${label.startsWith("Left") && x.r?.ok && x.r.value.contributionAfterAds < 0 ? "text-alert" : ""}`}>{x.r?.ok ? f(x.r.value) : "—"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-white/60">&ldquo;Left after product costs and ads&rdquo; is before rent, wages and other fixed costs — it isn&rsquo;t profit. Real results depend on your ads, offer, page and Meta&rsquo;s auction.</p>
          <div className="mt-3"><CopyButton text={summary} label="Copy table" /></div>
        </ResultPanel>
      )}

      {base?.ok && s.budget && (
        <NextStep
          title="Turn this budget into a plan"
          body="Your free MAIRO plan starts from this budget and shows how to test it — one campaign, one change at a time."
          action="Use this budget in my plan"
          handoff={{ kind: "budget", tool: "ad-roi", monthlyBudget: s.budget, label: "From the ad return calculator (the budget you modeled)" }}
        />
      )}
      <p className="text-[12px] text-faint">Treating the period as a month? A daily budget of about {m(s.budget ? s.budget / DAYS_PER_MONTH : null)}.</p>
    </div>
  );
}
