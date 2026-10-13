"use client";

import { CURRENCIES, currencySymbol, marginMarkup, money, percent, priceForMargin, priceForMarkup, type Currency } from "@/lib/calc/economics";
import { CopyButton, ExampleBadge, ExampleButton, NextStep, Notes, NumberField, Panel, Problems, ResultPanel, SelectField, Stat, useLocalState } from "./ui";

type S = { currency: Currency; cost: number | null; price: number | null; targetMargin: number | null; targetMarkup: number | null; example: boolean };
const EMPTY: S = { currency: "USD", cost: null, price: null, targetMargin: null, targetMarkup: null, example: false };
const EXAMPLE: S = { currency: "USD", cost: 60, price: 100, targetMargin: 50, targetMarkup: 100, example: true };

export function MarginMarkupTool() {
  const [s, setS] = useLocalState<S>("margin-markup", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const sym = currencySymbol(s.currency);
  const m = (n: number | null) => money(n, s.currency);
  const r = marginMarkup(s);
  const forMargin = s.targetMargin != null && s.cost ? priceForMargin({ cost: s.cost, marginPct: s.targetMargin }) : null;
  const forMarkup = s.targetMarkup != null && s.cost ? priceForMarkup({ cost: s.cost, markupPct: s.targetMarkup }) : null;
  const summary = r.ok ? `Cost ${m(s.cost)}, price ${m(s.price)}: profit ${m(r.value.profit)}, margin ${percent(r.value.margin)}, markup ${percent(r.value.markup)}.` : "";

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">Cost and price<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectField label="Currency" value={s.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <div className="hidden sm:block" />
          <NumberField label="What it costs you" value={s.cost} onChange={(v) => set({ cost: v })} prefix={sym} />
          <NumberField label="What you sell it for" value={s.price} onChange={(v) => set({ price: v })} prefix={sym} />
        </div>
        <p className="mt-6 text-[14px] font-semibold text-white">Work backwards</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <NumberField label="Target margin" hint="Price for this margin." value={s.targetMargin} onChange={(v) => set({ targetMargin: v })} suffix="%" />
          <NumberField label="Target markup" hint="Price for this markup." value={s.targetMarkup} onChange={(v) => set({ targetMarkup: v })} suffix="%" />
        </div>
      </Panel>
      <div className="space-y-5">
        {!r.ok ? (
          <Problems problems={r.problems} />
        ) : (
          <ResultPanel>
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Profit per sale" value={m(r.value.profit)} />
              <Stat strong label="Margin" value={percent(r.value.margin)} sub="Profit ÷ price" />
              <Stat strong label="Markup" value={percent(r.value.markup)} sub="Profit ÷ cost" />
            </div>
            <Notes notes={r.notes} tone={r.value.profit < 0 ? "warn" : "neutral"} />
            <p className="mt-4 text-[13px] leading-relaxed text-white/75">
              Same profit, different denominators: a {percent(r.value.margin)} margin and a {percent(r.value.markup)} markup describe the same price. Mixing them up is the most common pricing mistake.
            </p>
            <div className="mt-4"><CopyButton text={summary} label="Copy result" /></div>
          </ResultPanel>
        )}
        {(forMargin || forMarkup) && (
          <ResultPanel title="Prices for your targets">
            <div className="grid gap-3 sm:grid-cols-2">
              {forMargin && (forMargin.ok ? <Stat label={`Price for a ${s.targetMargin}% margin`} value={m(forMargin.value.price)} sub="Cost ÷ (1 − margin)" /> : <Problems problems={forMargin.problems} />)}
              {forMarkup && (forMarkup.ok ? <Stat label={`Price for a ${s.targetMarkup}% markup`} value={m(forMarkup.value.price)} sub="Cost × (1 + markup)" /> : <Problems problems={forMarkup.problems} />)}
            </div>
          </ResultPanel>
        )}
        {r.ok && (
          <NextStep
            title="Next: what can you pay for a sale?"
            body="Margin is before ads. The break-even ROAS calculator adds shipping, fees and refunds to show what an ad can cost before a sale stops paying."
            action="Open the break-even calculator"
            href="/tools/break-even-roas"
          />
        )}
      </div>
    </div>
  );
}
