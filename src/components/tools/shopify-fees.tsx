"use client";

import { compareShopifyPlans, DEFAULT_RATES, OFFICIAL_PRICING_URL, RATES_CHECKED, SOURCES, type ShopifyPlanRates } from "@/lib/calc/shopify-fees";
import { money, percent } from "@/lib/calc/economics";
import { Choice, CopyButton, ExampleBadge, ExampleButton, NextStep, NumberField, Panel, Problems, ResultPanel, secondaryBtn, useLocalState } from "./ui";

type S = { monthlySales: number | null; orders: number | null; billing: "monthly" | "yearly"; payments: "shopify" | "other"; providerPct: number | null; providerFixed: number | null; rates: ShopifyPlanRates[]; example: boolean };
const EMPTY: S = { monthlySales: null, orders: null, billing: "monthly", payments: "shopify", providerPct: null, providerFixed: null, rates: DEFAULT_RATES, example: false };
const EXAMPLE: S = { ...EMPTY, monthlySales: 12000, orders: 240, example: true };

const RATE_FIELDS: [keyof ShopifyPlanRates, string][] = [
  ["monthly", "Monthly price ($, billed monthly)"],
  ["yearly", "Monthly price ($, billed yearly)"],
  ["cardPct", "Online card rate (%)"],
  ["cardFixed", "Card fee per order ($)"],
  ["thirdPartyPct", "Fee with another payment provider (%)"],
];

export function ShopifyFeesTool() {
  const [s, setS] = useLocalState<S>("shopify-fees", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const edited = JSON.stringify(s.rates) !== JSON.stringify(DEFAULT_RATES);
  const r = compareShopifyPlans(s, s.rates);
  const m = (n: number | null) => money(n, "USD");
  const summary = r.ok ? r.value.plans.map((p) => `${p.name}: ${m(p.total)} a month (${percent(p.shareOfSales)} of sales)`).join("\n") : "";
  return (
    <div className="space-y-5">
      <div role="note" className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.07] px-4 py-3 text-[13px] leading-relaxed text-amber-100">
        <p className="font-medium text-amber-50">Check these rates before you rely on them.</p>
        <p className="mt-1">
          The starting rates are United States figures from public summaries checked on {RATES_CHECKED} ({SOURCES.map((x, n) => (
            <span key={x.url}>{n ? ", " : ""}<a className="underline underline-offset-2" href={x.url} target="_blank" rel="noopener noreferrer">{x.name}</a></span>
          ))}). MAIRO couldn&rsquo;t confirm them against Shopify&rsquo;s own page, and Shopify&rsquo;s rates differ by country and change. Compare with{" "}
          <a className="underline underline-offset-2" href={OFFICIAL_PRICING_URL} target="_blank" rel="noopener noreferrer">Shopify&rsquo;s pricing page</a> and edit any rate below.
        </p>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[15px] font-semibold text-white">Your store, per month<ExampleBadge show={s.example} /></p>
            <ExampleButton onClick={() => setS({ ...EXAMPLE, rates: s.rates })} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <NumberField label="Sales per month" value={s.monthlySales} onChange={(v) => set({ monthlySales: v })} prefix="$" />
            <NumberField label="Orders per month" value={s.orders} onChange={(v) => set({ orders: v })} step="1" />
            <Choice label="Billing" value={s.billing} onChange={(v) => set({ billing: v })} options={[{ value: "monthly", label: "Monthly" }, { value: "yearly", label: "Yearly" }]} />
            <Choice label="Payments" value={s.payments} onChange={(v) => set({ payments: v })} options={[{ value: "shopify", label: "Shopify Payments" }, { value: "other", label: "Another provider" }]} />
            {s.payments === "other" && (
              <>
                <NumberField label="Your provider's rate" value={s.providerPct} onChange={(v) => set({ providerPct: v })} suffix="%" />
                <NumberField label="Your provider's fee per order" value={s.providerFixed} onChange={(v) => set({ providerFixed: v })} prefix="$" />
              </>
            )}
          </div>
          <details className="mt-5">
            <summary className="cursor-pointer text-[13.5px] font-medium text-white">Edit the rates {edited && <span className="text-amber-200">(edited)</span>}</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[460px] text-left text-[13px]">
                <thead><tr className="text-white/60"><th className="py-1.5 pr-2 font-medium" />{s.rates.map((p) => <th key={p.id} className="py-1.5 pr-2 font-medium text-white">{p.name}</th>)}</tr></thead>
                <tbody>
                  {RATE_FIELDS.map(([f, label]) => (
                    <tr key={f} className="border-t border-white/[0.06]">
                      <th scope="row" className="py-1.5 pr-2 font-normal text-white/65">{label}</th>
                      {s.rates.map((p, n) => (
                        <td key={p.id} className="py-1.5 pr-2">
                          <input aria-label={`${p.name}: ${label}`} type="number" step="any" min={0} value={p[f] as number} onChange={(e) => set({ rates: s.rates.map((x, i) => (i === n ? { ...x, [f]: Number(e.target.value) } : x)) })} className="w-24 rounded-md border border-white/12 bg-white/[0.04] px-2 py-1.5 text-white outline-none focus:border-violet/70" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" className={`${secondaryBtn} mt-3`} onClick={() => set({ rates: DEFAULT_RATES })} disabled={!edited}>Reset to the starting rates</button>
          </details>
        </Panel>
        <div className="space-y-5">
          {!r.ok ? (
            <Problems problems={r.problems} />
          ) : (
            <ResultPanel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-[13.5px]">
                  <thead><tr className="text-white/60"><th className="py-2 pr-3 font-medium">Plan</th><th className="py-2 pr-3 font-medium">Subscription</th><th className="py-2 pr-3 font-medium">Card fees</th>{s.payments === "other" && <th className="py-2 pr-3 font-medium">Shopify fee</th>}<th className="py-2 font-medium">Total</th></tr></thead>
                  <tbody className="text-white/85">
                    {r.value.plans.map((p) => (
                      <tr key={p.id} className={`border-t border-white/[0.06] ${p.id === r.value.cheapest ? "text-white" : ""}`}>
                        <th scope="row" className="py-2 pr-3 font-medium">{p.name}{p.id === r.value.cheapest && <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">Lowest</span>}</th>
                        <td className="py-2 pr-3">{m(p.subscription)}</td>
                        <td className="py-2 pr-3">{m(p.cardFees)}</td>
                        {s.payments === "other" && <td className="py-2 pr-3">{m(p.shopifyTransactionFees)}</td>}
                        <td className="py-2 font-semibold">{m(p.total)} <span className="font-normal text-white/50">({percent(p.shareOfSales)})</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-white/60">{r.notes.join(" ")} Plus and Starter plans aren&rsquo;t compared. Lowest cost isn&rsquo;t always the right plan — features differ.</p>
              <div className="mt-3"><CopyButton text={summary} label="Copy comparison" /></div>
            </ResultPanel>
          )}
          {r.ok && (
            <NextStep title="Next: what can you pay for an order?" body="Store fees are one cost of a sale. The break-even ROAS calculator adds product, delivery and refunds to show what an ad can cost." action="Open the break-even calculator" href="/tools/break-even-roas" />
          )}
        </div>
      </div>
    </div>
  );
}
