"use client";

import { economicsFromSale } from "@/lib/calc/assumptions";
import { breakEven, CURRENCIES, currencySymbol, money, percent, saleEconomics, times, type Currency } from "@/lib/calc/economics";
import { ExampleBadge, ExampleButton, NextStep, Notes, NumberField, Panel, Problems, ResultPanel, SelectField, Stat, CopyButton, useLocalState } from "./ui";

type S = {
  currency: Currency;
  price: number | null;
  discountPct: number | null;
  refundPct: number | null;
  productCost: number | null;
  fulfilmentCost: number | null;
  paymentFeePct: number | null;
  paymentFeeFixed: number | null;
  otherVariableCost: number | null;
  reserve: number | null;
  example: boolean;
};

const EMPTY: S = { currency: "USD", price: null, discountPct: null, refundPct: null, productCost: null, fulfilmentCost: null, paymentFeePct: null, paymentFeeFixed: null, otherVariableCost: null, reserve: null, example: false };
const EXAMPLE: S = { currency: "USD", price: 100, discountPct: 0, refundPct: 0, productCost: 60, fulfilmentCost: 0, paymentFeePct: 0, paymentFeeFixed: 0, otherVariableCost: 0, reserve: 10, example: true };

export function BreakEvenRoasTool() {
  const [s, setS] = useLocalState<S>("break-even-roas", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const r = saleEconomics(s);
  const be = r.ok ? breakEven(r.value, s.reserve ?? 0) : null;
  const m = (n: number | null) => money(n, s.currency);
  const sym = currencySymbol(s.currency);
  const summary = r.ok && be
    ? be.breakEvenRoas
      ? `Break-even ROAS ${times(be.breakEvenRoas)} (contribution ${m(be.contribution)} per sale, before fixed costs).${be.targetRoas ? ` Keeping ${m(s.reserve ?? 0)} per sale: ${times(be.targetRoas)}.` : ""}`
      : "Each sale loses money before advertising — no break-even ROAS."
    : "";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">One sale<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectField label="Currency" value={s.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <NumberField label="Price the customer pays" value={s.price} onChange={(v) => set({ price: v })} prefix={sym} />
          <NumberField label="Product or job cost" hint="What you pay for what you sell." value={s.productCost} onChange={(v) => set({ productCost: v })} prefix={sym} />
          <NumberField label="Shipping or delivery per sale" value={s.fulfilmentCost} onChange={(v) => set({ fulfilmentCost: v })} prefix={sym} placeholder="0" />
          <NumberField label="Payment fee" hint="Card or checkout fee, % of the amount." value={s.paymentFeePct} onChange={(v) => set({ paymentFeePct: v })} suffix="%" placeholder="0" />
          <NumberField label="Payment fee per sale" value={s.paymentFeeFixed} onChange={(v) => set({ paymentFeeFixed: v })} prefix={sym} placeholder="0" />
          <NumberField label="Average discount" value={s.discountPct} onChange={(v) => set({ discountPct: v })} suffix="%" placeholder="0" />
          <NumberField label="Share of sales refunded" value={s.refundPct} onChange={(v) => set({ refundPct: v })} suffix="%" placeholder="0" />
          <NumberField label="Other cost on every sale" hint="Commission, packaging, materials." value={s.otherVariableCost} onChange={(v) => set({ otherVariableCost: v })} prefix={sym} placeholder="0" />
          <NumberField label="Profit to keep per sale (optional)" hint="Leave a reserve after paying for the ad." value={s.reserve} onChange={(v) => set({ reserve: v })} prefix={sym} placeholder="0" />
        </div>
      </Panel>

      <div className="space-y-5">
        {!r.ok ? (
          <Problems problems={r.problems} />
        ) : (
          <ResultPanel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat strong label="Break-even ROAS" value={be?.breakEvenRoas ? times(be.breakEvenRoas) : "None"} sub={be?.breakEvenRoas ? `Each ${m(1)} of ad spend needs ${m(be.breakEvenRoas)} in sales.` : "There's no ROAS at which a losing sale breaks even."} />
              <Stat strong label="Most you can pay per sale" value={m(be?.breakEvenCpa ?? null)} sub="Break-even cost per purchase, before fixed costs." />
              <Stat label="Contribution per sale" value={m(r.value.contribution)} sub={`${percent(r.value.contributionMargin)} of net revenue`} />
              <Stat label="Net revenue per sale" value={m(r.value.netRevenue)} sub="After discounts and refunds." />
              {(s.reserve ?? 0) > 0 && (
                <>
                  <Stat label="Target ROAS (keeping your reserve)" value={be?.targetRoas ? times(be.targetRoas) : "None"} />
                  <Stat label="Target cost per sale" value={m(be?.targetCpa ?? null)} sub={be?.targetCpa ? undefined : "The reserve uses up the whole contribution."} />
                </>
              )}
            </div>
            <Notes notes={r.notes} tone={r.value.contribution <= 0 ? "warn" : "neutral"} />
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton text={summary} label="Copy result" />
            </div>
          </ResultPanel>
        )}
        {r.ok && be?.breakEvenRoas && (
          <NextStep
            title="Plan campaigns around this number"
            body={s.example ? "Enter your own numbers and your free MAIRO plan can measure its first test against your break-even — whether each sale pays, not clicks." : "Your free MAIRO plan can start from your break-even point, so you judge ads by whether each sale pays — not by clicks."}
            action="Use this in my free plan"
            handoff={(() => {
              // Example numbers aren't the owner's, so they're never carried into a plan.
              const e = !s.example && r.ok && be ? economicsFromSale(r.value, be, s.currency, "break-even-roas") : null;
              return e ? { kind: "economics" as const, tool: "break-even-roas", economics: e } : null;
            })()}
          />
        )}
      </div>
    </div>
  );
}
