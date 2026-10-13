"use client";

import { CURRENCIES, currencySymbol, money, num, percent, serviceEconomics, type Currency } from "@/lib/calc/economics";
import { Choice, CopyButton, ExampleBadge, ExampleButton, NextStep, Notes, NumberField, Panel, Problems, ResultPanel, SelectField, Stat, useLocalState } from "./ui";

type S = {
  currency: Currency;
  jobValue: number | null;
  jobCost: number | null;
  mode: "two-step" | "total";
  leadToBookingPct: number | null;
  bookingToSalePct: number | null;
  leadToSalePct: number | null;
  reservePerJob: number | null;
  currentCpl: number | null;
  example: boolean;
};
const EMPTY: S = { currency: "USD", jobValue: null, jobCost: null, mode: "two-step", leadToBookingPct: null, bookingToSalePct: null, leadToSalePct: null, reservePerJob: null, currentCpl: null, example: false };
const EXAMPLE: S = { currency: "USD", jobValue: 600, jobCost: 200, mode: "two-step", leadToBookingPct: 50, bookingToSalePct: 40, leadToSalePct: null, reservePerJob: 100, currentCpl: 45, example: true };

export function ServiceLeadEconomicsTool() {
  const [s, setS] = useLocalState<S>("service-lead-economics", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const sym = currencySymbol(s.currency);
  const m = (n: number | null) => money(n, s.currency);
  const r = serviceEconomics({
    jobValue: s.jobValue,
    jobCost: s.jobCost,
    rates: s.mode === "two-step" ? { mode: "two-step", leadToBookingPct: s.leadToBookingPct, bookingToSalePct: s.bookingToSalePct } : { mode: "total", leadToSalePct: s.leadToSalePct },
    reservePerJob: s.reservePerJob,
    currentCpl: s.currentCpl,
  });
  const summary = r.ok
    ? `Job contribution ${m(r.value.contributionPerJob)}; ${percent(r.value.leadToSale)} of leads become paid jobs → break-even cost per lead ${m(r.value.breakEvenCpl)}${r.value.targetCpl ? `, target ${m(r.value.targetCpl)} keeping ${m(s.reservePerJob ?? 0)} per job` : ""} (before fixed costs).`
    : "";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">A typical job<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectField label="Currency" value={s.currency} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          <NumberField label="What a typical job is worth" hint="The invoice." value={s.jobValue} onChange={(v) => set({ jobValue: v })} prefix={sym} />
          <NumberField label="Cost of doing the job" hint="Materials, subcontractors, travel." value={s.jobCost} onChange={(v) => set({ jobCost: v })} prefix={sym} />
          <NumberField label="Profit to keep per job (optional)" value={s.reservePerJob} onChange={(v) => set({ reservePerJob: v })} prefix={sym} placeholder="0" />
        </div>
        <div className="mt-5">
          <Choice
            label="What do you know about your leads?"
            value={s.mode}
            onChange={(v) => set({ mode: v })}
            options={[
              { value: "two-step", label: "How many book, and how many bookings pay" },
              { value: "total", label: "How many leads end up paying" },
            ]}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {s.mode === "two-step" ? (
            <>
              <NumberField label="Leads that book" hint="Out of every 100 leads, how many book a visit, call or estimate." value={s.leadToBookingPct} onChange={(v) => set({ leadToBookingPct: v })} suffix="%" />
              <NumberField label="Bookings that become paid jobs" hint="Out of every 100 bookings." value={s.bookingToSalePct} onChange={(v) => set({ bookingToSalePct: v })} suffix="%" />
            </>
          ) : (
            <NumberField label="Leads that become paid jobs" hint="Out of every 100 leads." value={s.leadToSalePct} onChange={(v) => set({ leadToSalePct: v })} suffix="%" />
          )}
          <NumberField label="Your cost per lead now (optional)" hint="From Meta, or what you expect." value={s.currentCpl} onChange={(v) => set({ currentCpl: v })} prefix={sym} />
        </div>
      </Panel>
      <div className="space-y-5">
        {!r.ok ? (
          <Problems problems={r.problems} />
        ) : (
          <ResultPanel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat strong label="Break-even cost per lead" value={m(r.value.breakEvenCpl)} sub="Lead-to-paid-job rate × contribution per job" />
              <Stat strong label="Target cost per lead" value={m(r.value.targetCpl)} sub={(s.reservePerJob ?? 0) > 0 ? `Keeping ${m(s.reservePerJob ?? 0)} per job` : "Add a profit to keep per job"} />
              <Stat label="Contribution per job" value={m(r.value.contributionPerJob)} />
              <Stat label="Leads per paid job" value={num(r.value.leadsPerJob, 1)} sub={`${percent(r.value.leadToSale)} of leads pay`} />
              {r.value.breakEvenCostPerBooking !== null && <Stat label="Break-even cost per booking" value={m(r.value.breakEvenCostPerBooking)} />}
              {r.value.atCurrentCpl && (
                <Stat label={`At ${m(s.currentCpl)} a lead`} value={`${m(r.value.atCurrentCpl.costPerJob)} per job`} sub={r.value.atCurrentCpl.leftPerJob >= 0 ? `${m(r.value.atCurrentCpl.leftPerJob)} of the job left after ads` : `Each job loses ${m(-r.value.atCurrentCpl.leftPerJob)} after ads`} />
              )}
            </div>
            <Notes notes={r.notes} tone={r.value.breakEvenCpl === null ? "warn" : "neutral"} />
            <p className="mt-3 text-[12.5px] leading-relaxed text-white/60">Before fixed costs. A booking isn&rsquo;t a paid job: tapping a booking link isn&rsquo;t a booking either — count what actually happened.</p>
            <div className="mt-4"><CopyButton text={summary} label="Copy result" /></div>
          </ResultPanel>
        )}
        {r.ok && r.value.breakEvenCpl !== null && (
          <NextStep
            title="Run ads against this number"
            body="Your free MAIRO plan uses lead quality, bookings and paid jobs — not just lead count — to judge your ads, and you mark each lead's outcome."
            action="Use this in my free plan"
            handoff={{ kind: "note", tool: "service-lead-economics", label: "Lead economics from the cost-per-lead calculator", text: summary }}
          />
        )}
      </div>
    </div>
  );
}
