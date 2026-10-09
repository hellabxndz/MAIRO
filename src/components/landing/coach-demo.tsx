"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { ExampleStep, ExampleView } from "@/lib/coach/example";

// The landing page's Performance Coach demonstration: an invented roofing
// company's last two weeks, at three moments — leads in but unmarked; marked
// (25 leads, 4 qualified); and with the reasons recorded. What's shown at
// each moment is what the real diagnostic engine said about those figures
// (see src/lib/coach/example.ts), so the demo can't claim more than the
// product does — including saying when it can't tell.

const STEPS: { id: ExampleStep; n: string; label: string; sub: string }[] = [
  { id: "unmarked", n: "1", label: "Leads come in", sub: "25 enquiries, none marked yet" },
  { id: "marked", n: "2", label: "The owner marks them", sub: "4 of the 25 marked qualified" },
  { id: "reasons", n: "3", label: "Reasons recorded", sub: "Why the others weren't a fit" },
];

const SOURCE: Record<string, string> = {
  Meta: "bg-blue/10 text-blue-bright",
  "MAIRO counted": "bg-white/[0.06] text-muted",
  "You marked": "bg-violet/10 text-violet-bright",
  "You entered": "bg-violet/10 text-violet-bright",
  "Your store": "bg-live/10 text-live",
};

const h = "text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-bright";

function Journey({ view }: { view: ExampleView }) {
  const drop = view.finding !== null;
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" aria-label="From advertising to revenue">
      {view.journey.map((s) => {
        const flagged = drop && s.key === "qualified";
        return (
          <li key={s.key} className={`relative rounded-2xl border px-3 py-2.5 ${flagged ? "border-warn/50 bg-warn/[0.06]" : s.value === null ? "border-dashed border-white/15" : "border-white/10 bg-white/[0.02]"}`}>
            <p className="text-[11.5px] font-medium text-muted">{s.label}</p>
            <p className={`mt-0.5 text-[20px] font-semibold tabular-nums tracking-[-0.02em] ${s.value === null ? "text-faint" : "text-white"}`}>{s.value ?? "—"}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SOURCE[s.source]}`}>{s.source}</span>
              {s.rate && <span className={`text-[10.5px] ${flagged ? "font-medium text-warn" : "text-faint"}`}>{s.rate}</span>}
            </p>
            {s.value === null && <p className="mt-1 text-[10.5px] leading-snug text-faint">Not marked yet</p>}
            {flagged && <span className="absolute -top-2 right-2 rounded-full bg-warn px-2 py-0.5 text-[10px] font-semibold text-white">Biggest drop</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Finding({ view }: { view: ExampleView }) {
  const f = view.finding;
  if (!f) {
    const gap = view.gaps[0];
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h4 className={h}>What MAIRO noticed</h4>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/90">25 leads came in over two weeks, at $24 each in ad spend. None is marked yet.</p>
        </section>
        <section>
          <h4 className={h}>What MAIRO can say about quality</h4>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/90">Nothing yet — and it won&rsquo;t guess. A form filled in isn&rsquo;t a good lead, a booking or a customer until the owner says so.</p>
        </section>
        {gap && (
          <section className="md:col-span-2">
            <h4 className={h}>What data is missing</h4>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/90">
              <span className="font-medium text-white">{gap.title}.</span> {gap.why}
            </p>
          </section>
        )}
      </div>
    );
  }
  const evidenceBased = f.explanations.some((e) => e.basis === "evidence");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-[11px] font-medium text-warn">Needs attention</span>
        <span className="text-[12px] text-muted">&ldquo;Roof inspections&rdquo; campaign</span>
      </div>
      <p className="mt-2 text-[16.5px] font-semibold tracking-[-0.01em] text-white">{f.title}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-white/80">{f.plain}</p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <section>
          <h4 className={h}>What MAIRO noticed</h4>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/90">{f.noticed}</p>
        </section>
        <section>
          <h4 className={h}>Why it might be happening</h4>
          <ul className="mt-1.5 space-y-1.5">
            {f.explanations.map((e) => (
              <li key={e.text} className="flex items-start gap-2 text-[13px] leading-relaxed text-white/90">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] ${e.basis === "evidence" ? "bg-violet/10 text-violet-bright" : "bg-white/[0.06] text-muted"}`}>{e.basis === "evidence" ? "In the records" : "Possibility"}</span>
                <span>{e.text}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-faint">{evidenceBased ? "Seen in the owner's records — still not proof it's the cause." : "Possible reasons only. The cause isn't confirmed."}</p>
        </section>
        <section>
          <h4 className={h}>What your AI team recommends</h4>
          <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-white">{f.recommendation}</p>
          <ol className="mt-2 space-y-1 text-[12.5px] text-white/80">
            {f.steps.map((s, i) => (
              <li key={s.title} className={s.title === "Hold off on more budget" ? "font-medium text-warn" : ""}>
                {i + 1}. {s.title}
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h4 className={h}>What information supports this</h4>
          <dl className="mt-1.5 grid gap-1">
            {f.evidence.map((e) => (
              <div key={e.label} className="flex justify-between gap-3 border-b border-white/[0.07] pb-1 text-[12.5px]">
                <dt className="text-muted">{e.label}</dt>
                <dd className="tabular-nums text-white">{e.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">
            {f.confidence} in what it noticed. {f.limitations}
          </p>
        </section>
        <section>
          <h4 className={h}>What data is missing</h4>
          <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-white/85">
            {f.missing.length ? f.missing.map((m) => <li key={m}>{m}</li>) : <li>Nothing essential for this one.</li>}
          </ul>
        </section>
        <section>
          <h4 className={h}>Approve or investigate</h4>
          <div className="mt-2 flex flex-wrap gap-2" aria-hidden>
            <span className="rounded-full bg-[image:var(--mairo-ramp)] px-3.5 py-1.5 text-[12.5px] font-medium text-white">Approve the plan</span>
            <span className="rounded-full border border-white/15 px-3.5 py-1.5 text-[12.5px] text-white/85">Investigate with your AI team</span>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-faint">In MAIRO, approving a plan changes nothing on Meta. Any change to a campaign shows what will change and waits for its own approval.</p>
        </section>
      </div>
    </div>
  );
}

export function CoachDemo({ views }: { views: Record<ExampleStep, ExampleView> }) {
  const [step, setStep] = useState<ExampleStep>("marked");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const view = views[step];

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = STEPS.findIndex((s) => s.id === step);
    const next = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const s = STEPS[(next + STEPS.length) % STEPS.length];
    setStep(s.id);
    refs.current[s.id]?.focus();
  };

  return (
    <div className="overflow-hidden rounded-[26px] border border-white/10 bg-paper shadow-[0_40px_120px_-50px_rgba(91,63,224,0.55)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-5 py-3.5 sm:px-6">
        <p className="text-[13px] font-medium text-white">
          An invented roofing company <span className="font-normal text-muted">· the last two weeks</span>
        </p>
        <span className="rounded-full border border-white/15 bg-paper px-2.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">Illustrative example</span>
      </div>

      <div role="tablist" aria-label="Moments in the example" onKeyDown={onKey} className="grid grid-cols-3 border-b border-white/[0.07]">
        {STEPS.map((s) => (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            role="tab"
            id={`coach-step-${s.id}`}
            aria-selected={step === s.id}
            aria-controls="coach-step-panel"
            tabIndex={step === s.id ? 0 : -1}
            onClick={() => setStep(s.id)}
            className={`border-b-2 px-2 py-3 text-left transition sm:px-5 ${step === s.id ? "border-violet-bright bg-violet/[0.05]" : "border-transparent hover:bg-white/[0.03]"}`}
          >
            <span className="flex items-center gap-2">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${step === s.id ? "bg-[image:var(--mairo-ramp)] text-white" : "bg-white/[0.07] text-muted"}`}>{s.n}</span>
              <span className={`text-[12.5px] font-semibold leading-tight sm:text-[13.5px] ${step === s.id ? "text-white" : "text-white/75"}`}>{s.label}</span>
            </span>
            <span className="mt-1 hidden text-[11.5px] text-muted sm:block">{s.sub}</span>
          </button>
        ))}
      </div>

      <div id="coach-step-panel" role="tabpanel" aria-labelledby={`coach-step-${step}`} className="p-5 sm:p-6">
        <Journey view={view} />
        <div className="mt-5 rounded-2xl border border-white/[0.07] p-4 sm:p-5" aria-live="polite">
          <Finding view={view} />
        </div>
      </div>
      <p className="border-t border-white/[0.07] px-5 py-3 text-[11.5px] leading-relaxed text-faint sm:px-6">
        Invented figures for an invented business, run through the same Performance Coach a real account uses. Not a real customer&rsquo;s results.
      </p>
    </div>
  );
}
