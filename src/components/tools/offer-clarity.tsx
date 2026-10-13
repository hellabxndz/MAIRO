"use client";

import { checkOfferClarity, type ClarityInput, type ClarityStatus } from "@/lib/creative/offer-clarity";
import { Choice, CopyButton, ExampleBadge, ExampleButton, NextStep, Panel, ResultPanel, TextField, useLocalState } from "./ui";

type S = Required<Pick<ClarityInput, "headline">> & Omit<ClarityInput, "headline"> & { example: boolean };
const EMPTY: S = { headline: "", subheadline: "", cta: "", offering: "", customer: "", location: "", outcome: "", priceOrFirstStep: "", kind: "service", example: false };
const EXAMPLE: S = { headline: "Innovative plumbing solutions for all your needs", subheadline: "The best service in town — limited time only!", cta: "Submit", offering: "emergency plumbing", customer: "homeowners", location: "Eastfield", outcome: "water back on the same day", priceOrFirstStep: "Price given before we come out", kind: "service", example: true };

const BADGE: Record<ClarityStatus, string> = {
  met: "bg-emerald-400/15 text-emerald-300",
  "not met": "bg-amber-400/15 text-amber-200",
  "not checked": "bg-white/[0.06] text-white/60",
};

export function OfferClarityTool() {
  const [s, setS] = useLocalState<S>("offer-clarity", EMPTY);
  const set = (p: Partial<S>) => setS((x) => ({ ...x, ...p, example: false }));
  const r = s.headline.trim() ? checkOfferClarity(s) : null;
  const text = r
    ? [`Offer clarity — ${r.met} of ${r.judged} checks met (a rubric, not a forecast)`, ...r.checks.map((c) => `- [${c.status}] ${c.question}${c.evidence ? ` — ${c.evidence}` : ""}${c.fix ? ` → ${c.fix}` : ""}`), ...(r.suggestions.headline.length ? ["", "Headline ideas:", ...r.suggestions.headline.map((h) => `- ${h}`)] : [])].join("\n")
    : "";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-white">Your page&rsquo;s first screen<ExampleBadge show={s.example} /></p>
          <ExampleButton onClick={() => setS(EXAMPLE)} />
        </div>
        <div className="mt-4 grid gap-4">
          <TextField label="Headline" value={s.headline} onChange={(v) => set({ headline: v })} placeholder="The biggest line people see first" />
          <TextField label="The line under it" value={s.subheadline ?? ""} onChange={(v) => set({ subheadline: v })} />
          <TextField label="Main button" value={s.cta ?? ""} onChange={(v) => set({ cta: v })} placeholder="e.g. Book a visit" />
        </div>
        <p className="mt-6 text-[14px] font-semibold text-white">About the business <span className="font-normal text-white/50">· optional, makes the check sharper</span></p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Choice label="Kind of business" value={s.kind ?? "service"} onChange={(v) => set({ kind: v })} options={[{ value: "service", label: "Service" }, { value: "shop", label: "Shop" }]} />
          <TextField label="What you sell" value={s.offering ?? ""} onChange={(v) => set({ offering: v })} />
          <TextField label="Who it's for" value={s.customer ?? ""} onChange={(v) => set({ customer: v })} />
          <TextField label="Where you work" value={s.location ?? ""} onChange={(v) => set({ location: v })} />
          <TextField label="The result customers get" value={s.outcome ?? ""} onChange={(v) => set({ outcome: v })} />
          <TextField label="Price or first step (only if true)" value={s.priceOrFirstStep ?? ""} onChange={(v) => set({ priceOrFirstStep: v })} placeholder="e.g. From $95, or Free quote" />
        </div>
      </Panel>
      <div className="space-y-5">
        {!r ? (
          <Panel><p className="text-[14px] text-white/80">Paste your headline to see what a stranger would still have to guess.</p></Panel>
        ) : (
          <ResultPanel title={`${r.met} of ${r.judged} checks met`}>
            <p className="text-[12.5px] text-white/60">A checklist of what the words say — not a prediction of how the page will convert.</p>
            {r.questions.length > 0 && (
              <div className="mt-3 rounded-xl border border-white/10 bg-paper/60 p-4">
                <p className="text-[13px] font-medium text-white">Questions a visitor would still have</p>
                <ul className="mt-1.5 list-disc pl-5 text-[13.5px] text-white/85">{r.questions.map((q) => <li key={q}>{q}</li>)}</ul>
              </div>
            )}
            <ul className="mt-4 space-y-2.5">
              {r.checks.map((c) => (
                <li key={c.id} className="rounded-xl border border-white/10 bg-paper/40 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13.5px] font-medium text-white">{c.question}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${BADGE[c.status]}`}>{c.status === "not checked" ? "Not checked" : c.status === "met" ? "Yes" : "Not yet"}</span>
                  </div>
                  {c.evidence && <p className="mt-1 text-[12.5px] text-white/65">{c.evidence}</p>}
                  <p className="mt-1 text-[12.5px] text-white/55">{c.why}</p>
                  {c.fix && <p className="mt-1.5 text-[13px] text-white/90">→ {c.fix}</p>}
                </li>
              ))}
            </ul>
            {(r.suggestions.headline.length > 0 || r.suggestions.cta.length > 0) && (
              <div className="mt-4 rounded-xl border border-violet/30 bg-violet/[0.06] p-4">
                <p className="text-[13px] font-medium text-white">Built from what you told MAIRO</p>
                {r.suggestions.headline.map((h) => (
                  <div key={h} className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-[15px] text-white">{h}</p><CopyButton text={h} /></div>
                ))}
                {r.suggestions.cta.length > 0 && <p className="mt-3 text-[13px] text-white/75">Button ideas: {r.suggestions.cta.map((c) => `“${c}”`).join(", ")}</p>}
                <p className="mt-2 text-[12px] text-white/50">Ideas to test, not guaranteed improvements.</p>
              </div>
            )}
            <div className="mt-4"><CopyButton text={text} label="Copy the checklist" /></div>
          </ResultPanel>
        )}
        {r && (
          <NextStep
            title="Make your ads match the page"
            body="Your free MAIRO plan writes ads that say what this page says — so people who click find what the ad promised."
            action="Build my free ad plan"
            handoff={s.priceOrFirstStep?.trim() ? { kind: "offer", tool: "offer-clarity", offer: s.priceOrFirstStep.trim() } : { kind: "note", tool: "offer-clarity", label: "Offer clarity checklist", text }}
          />
        )}
      </div>
    </div>
  );
}
