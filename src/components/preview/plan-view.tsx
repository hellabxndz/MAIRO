"use client";

import Link from "next/link";
import { useState, type ReactNode, type RefObject } from "react";
import type { Direction, Preview, PreviewFacts, PreviewGoal } from "@/lib/preview/build";
import { FACT_LABEL } from "@/lib/preview/build";
import type { Finding } from "@/lib/website/audit";
import { EXAMPLES, EXAMPLE_ORDER, type ExampleType } from "@/lib/demo/examples";
import { PLANS, STARTER_TRIAL_DAYS } from "@/lib/plans";
import { FindingCard } from "@/components/tools/website-report";
import { Panel, Pill, primaryAction, quietAction } from "@/components/console/kit";
import { PlacementMock, mockLabel, type Placement } from "@/app/dashboard/creatives/suggested/placements";

// The free plan, presented the way MAIRO presents everything: in the console.
// The same panels, pills and placement mock-ups the signed-in app uses, so
// what a visitor sees here is what they'll work with after they sign up.
//
// Every line is built from facts the visitor confirmed (lib/preview/build.ts).
// The three concepts are recommendations — words and a direction for the
// picture — not generated ads, and each one says so. Refining with MAIRO
// proposes new words; the visitor decides whether to keep them.

type Edit = { hook?: string; headline?: string; body?: string };

const NAV = [
  ["pl-objective", "Objective"],
  ["pl-strategy", "Campaign strategy"],
  ["pl-budget", "Budget"],
  ["pl-creative", "Creative concepts"],
  ["pl-website", "Website"],
  ["pl-first", "First campaign"],
  ["pl-why", "Why MAIRO recommends it"],
  ["pl-refine", "Refine"],
] as const;

export function PlanView({
  preview: p,
  facts,
  findings,
  isExample,
  exampleType,
  headingRef,
  onEdit,
  onRefine,
  onSave,
  onStartOver,
  signUpHref,
}: {
  preview: Preview;
  facts: PreviewFacts;
  findings: Finding[];
  isExample: boolean;
  exampleType: ExampleType | null;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onEdit: () => void;
  onRefine: (patch: Partial<PreviewFacts>) => void;
  onSave: (kept: { hook: string }[]) => void;
  onStartOver: () => void;
  signUpHref: string;
}) {
  // A concept swapped for another direction, and words the visitor changed or kept from a MAIRO refinement.
  const [swaps, setSwaps] = useState<Record<number, Direction>>({});
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const concepts = p.directions.map((d, i) => swaps[i] ?? d);
  const unused = p.alternatives.filter((a) => !concepts.some((c) => c.angle === a.angle));
  const words = (d: Direction) => ({ hook: edits[d.angle]?.hook ?? d.hook, headline: edits[d.angle]?.headline ?? d.headline, body: edits[d.angle]?.body ?? d.primaryText });
  const keptHooks = () => concepts.filter((c) => saved[c.angle] || c.recommended).map((c) => ({ hook: words(c).hook }));
  const daily = p.allocation.daily;

  return (
    <article aria-labelledby="pv-title" className="@container/plan mx-auto max-w-[1240px]">
      {/* The console's header, for this business. */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="violet" dot>
            Free plan
          </Pill>
          <Pill tone="muted">Not launched · nothing spent</Pill>
          {isExample ? (
            <Pill tone="warn">Example business — sample data</Pill>
          ) : (
            <Pill tone="blue">
              Built from {p.builtFrom.website ? `${p.builtFrom.website} website fact${p.builtFrom.website === 1 ? "" : "s"}` : ""}
              {p.builtFrom.website && p.builtFrom.you ? " + " : ""}
              {p.builtFrom.you ? `${p.builtFrom.you} you entered` : ""}
              {!p.builtFrom.website && !p.builtFrom.you ? "what you entered" : ""}
            </Pill>
          )}
        </div>
        <h1 id="pv-title" ref={headingRef} tabIndex={-1} className="mt-4 text-[clamp(28px,4vw,46px)] font-semibold leading-[1.05] tracking-[-0.035em] text-white outline-none">
          {p.name}: your free advertising plan
        </h1>
        <p className="mt-3 max-w-[780px] text-[15px] leading-relaxed text-white/70">
          {isExample
            ? "What MAIRO plans from a business's facts. Try it with your own business to see yours."
            : "How MAIRO would advertise your business on Facebook and Instagram — built only from what you confirmed. It isn't a forecast: no one can promise how many customers an ad brings."}
        </p>
      </header>

      <div className="grid gap-6 @4xl/plan:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Plan sections" className="hidden @4xl/plan:block">
          <ol className="sticky top-24 space-y-0.5 border-l pl-3" style={{ borderColor: "var(--mairo-line)" }}>
            {NAV.filter(([id]) => !(isExample && id === "pl-refine")).map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-2 py-1.5 text-[13px] text-muted transition hover:bg-white/[0.04] hover:text-white">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="min-w-0 space-y-4 @xl/plan:space-y-5">
          {/* At a glance — the plan as four numbers-free headline facts. */}
          <div className="grid grid-cols-2 gap-3 @4xl/plan:grid-cols-4">
            <Glance label="Objective" value={p.plan.optimiseFor} />
            <Glance label="Where" value="Facebook & Instagram" />
            <Glance label="Daily budget" value={`$${daily}`} note={p.allocation.fromOwner ? "From your monthly figure" : "Example — you choose"} />
            <Glance label="Ad concepts" value={`${concepts.length}`} note="One marked to test first" />
          </div>

          <Panel id="pl-objective" title="Recommended objective" style={{ scrollMarginTop: 96 }}>
            <p className="text-[19px] font-semibold text-white">{p.plan.objective}</p>
            <p className="mt-2 max-w-[760px] text-[13.5px] leading-relaxed text-white/70">{p.reasons[0]?.text}</p>
            <dl className="mt-4 grid gap-3 @md:grid-cols-2">
              <Row label="People go to" value={p.plan.destination} />
              <Row label="Judged on" value={p.firstCampaign.judgedOn} />
            </dl>
          </Panel>

          <Panel id="pl-strategy" title="Meta campaign strategy" style={{ scrollMarginTop: 96 }}>
            <p className="text-[16px] font-medium text-white">{p.strategy.campaign}</p>
            <ul className="mt-3 space-y-2">
              {p.strategy.structure.map((line) => (
                <li key={line} className="flex gap-2.5 text-[13.5px] leading-relaxed text-white/80">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-violet-bright" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-3 @md:grid-cols-2">
              <Note title="Audience">{p.plan.audience}. {p.reasons[1]?.text}</Note>
              <Note title="Placements">{p.strategy.placements}</Note>
            </div>
            <p className="mt-3 text-[12.5px] text-faint">{p.strategy.learning}</p>
          </Panel>

          <Panel id="pl-budget" title="Suggested budget allocation" style={{ scrollMarginTop: 96 }}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-[clamp(26px,3vw,34px)] font-semibold tracking-[-0.03em] text-white tabular-nums">
                ${daily}
                <span className="text-[15px] font-normal text-muted"> a day · about ${p.allocation.monthly.toLocaleString("en-US")} a month</span>
              </p>
              <Pill tone={p.allocation.fromOwner ? "live" : "warn"}>{p.allocation.fromOwner ? "Your amount" : "Example amount"}</Pill>
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label="All of the budget goes to the first test for two weeks">
              <span className="h-full w-full bg-[image:var(--mairo-ramp)]" />
            </div>
            <ul className="mt-4 grid gap-3 @md:grid-cols-2">
              {p.allocation.parts.map((part) => (
                <li key={part.label} className="rounded-2xl border p-3.5" style={{ borderColor: "var(--mairo-line)" }}>
                  <p className="flex items-baseline justify-between gap-2 text-[13.5px] font-medium text-white">
                    {part.label} <span className="text-[12px] font-normal text-faint">{part.when}</span>
                  </p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">{part.why}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-faint">Your ad budget is paid to Meta, separately from any MAIRO subscription. Nothing is spent until you approve the exact budget.</p>
          </Panel>

          <Panel id="pl-creative" title="Creative strategy & concepts" style={{ scrollMarginTop: 96 }}>
            <p className="max-w-[820px] text-[14px] leading-relaxed text-white/80">{p.creativeStrategy}</p>
            <p className="mt-2 text-[12.5px] text-faint">
              These are concepts — the words and a direction for the picture — not finished ads. Pictures and video are made after you sign up, from your own photos or with MAIRO&rsquo;s image tools on a paid plan, and you approve every ad before it runs.
            </p>
            <ol className="mt-5 grid gap-4 @6xl/plan:grid-cols-3">
              {concepts.map((c, i) => (
                <ConceptCard
                  key={c.angle}
                  index={i}
                  concept={c}
                  words={words(c)}
                  facts={facts}
                  businessName={p.name}
                  saved={Boolean(saved[c.angle])}
                  canSwap={unused.length > 0}
                  isExample={isExample}
                  signUpHref={signUpHref}
                  onEdit={(e) => setEdits((prev) => ({ ...prev, [c.angle]: { ...prev[c.angle], ...e } }))}
                  onSwap={() => {
                    const next = unused[0];
                    if (next) setSwaps((prev) => ({ ...prev, [i]: { ...next, recommended: c.recommended } }));
                  }}
                  onSave={() => setSaved((prev) => ({ ...prev, [c.angle]: !prev[c.angle] }))}
                />
              ))}
            </ol>
            {p.couldAdd.length > 0 && !isExample && (
              <p className="mt-4 text-[13px] text-white/60">
                More to choose from:{" "}
                {p.couldAdd.map((c, i) => (
                  <span key={c.fact}>
                    {i ? "; " : ""}add {FACT_LABEL[c.fact].toLowerCase()} for {c.gives}
                  </span>
                ))}
                .{" "}
                <button type="button" onClick={onEdit} className="text-violet-bright underline underline-offset-2 hover:text-white">
                  Add details
                </button>
              </p>
            )}
          </Panel>

          <Panel id="pl-website" title="Website improvement opportunities" style={{ scrollMarginTop: 96 }}>
            {findings.length > 0 ? (
              <>
                <p className="-mt-1 mb-3 text-[13px] text-white/65">From the pages MAIRO read. Fixing these before you spend makes every click worth more.</p>
                <ul className="grid gap-3">
                  {findings.map((f) => (
                    <FindingCard key={f.key} f={f} compact />
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-[13.5px] text-white/70">
                {facts.website ? "Nothing urgent stood out on the pages MAIRO read. Your account runs the full website check." : "MAIRO didn't read a website for this plan. Add one and it checks what an ad visitor would see — speed, the call to action, tracking."}
              </p>
            )}
            <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--mairo-line)" }}>
              <p className="text-[13.5px] font-medium text-white">What Meta needs to see</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-white/65">{p.tracking.status}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {p.tracking.events.map((e) => (
                  <li key={e.name}>
                    <Pill tone={e.required ? "violet" : "muted"}>
                      {e.name} · {e.required ? "needed" : "useful"}
                    </Pill>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel id="pl-first" title="Recommended first campaign" tone="lit" style={{ scrollMarginTop: 96 }}>
            <p className="text-[19px] font-semibold text-white">{p.firstCampaign.name}</p>
            <dl className="mt-3 grid gap-3 @md:grid-cols-2">
              <Row label="Objective" value={p.firstCampaign.objective} />
              <Row label="Budget" value={p.firstCampaign.budget} />
              <Row label="Length of the test" value={p.firstCampaign.length} />
              <Row label="Judged on" value={p.firstCampaign.judgedOn} />
            </dl>
            <ol className="mt-5 space-y-2">
              {p.readiness.map((r) => (
                <li key={r.label} className="flex gap-3 text-[13px]">
                  <Pill tone={r.state === "done" ? "live" : r.state === "next" ? "violet" : "muted"}>{r.state === "done" ? "Done" : r.state === "next" ? "Next" : "Later"}</Pill>
                  <span>
                    <span className="font-medium text-white">{r.label}</span>
                    <span className="block text-[12.5px] text-white/60">{r.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel id="pl-why" title="Why MAIRO recommends this" style={{ scrollMarginTop: 96 }}>
            <dl className="grid gap-3 @md:grid-cols-2">
              {p.reasons.map((r) => (
                <div key={r.title} className="rounded-2xl border p-4" style={{ borderColor: "var(--mairo-line)" }}>
                  <dt className="text-[13.5px] font-semibold text-white">{r.title}</dt>
                  <dd className="mt-1 text-[13px] leading-relaxed text-white/70">{r.text}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          {!isExample && <RefinePanel facts={facts} onRefine={onRefine} onEdit={onEdit} />}

          {/* Step 7: approve it, or get started. */}
          <Panel id="pl-next" title={isExample ? "See it for your business" : "Your next step"} tone="lit">
            {isExample ? (
              <>
                <p className="max-w-[720px] text-[14px] leading-relaxed text-white/75">Give MAIRO your website or a few words about your business and it builds this plan for you — free.</p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Link href="/preview" className={primaryAction}>
                    See Your Free Plan
                  </Link>
                  {EXAMPLE_ORDER.filter((k) => k !== exampleType).map((k) => (
                    <Link key={k} href={`/preview?example=${k}`} className={quietAction}>
                      {EXAMPLES[k].label} example
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-3 @xl:grid-cols-2">
                  <div className="rounded-2xl border border-violet-400/35 bg-violet-500/[0.07] p-4">
                    <Link href={signUpHref} onClick={() => onSave(keptHooks())} className={`${primaryAction} w-full`}>
                      Approve My Plan
                    </Link>
                    <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/70">Approving needs a free account — no card. Your facts carry over, MAIRO rebuilds this plan in your account, and you approve it there. You can still change anything.</p>
                  </div>
                  <div className="rounded-2xl border p-4" style={{ borderColor: "var(--mairo-line)" }}>
                    <Link href="/#pricing" className={`${quietAction} w-full`}>
                      Get Started With MAIRO
                    </Link>
                    <p className="mt-2.5 text-[12.5px] leading-relaxed text-white/70">
                      See the plans. A subscription is needed only when MAIRO builds and runs your campaign — from ${PLANS[0].priceMonthly} a month, with a {STARTER_TRIAL_DAYS}-day trial on {PLANS[0].name}. Your ad budget is paid to Meta.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button type="button" onClick={onEdit} className={quietAction}>
                    Change details
                  </button>
                  <button type="button" onClick={onStartOver} className={quietAction}>
                    Start over
                  </button>
                </div>
              </>
            )}
            <dl className="mt-5 grid gap-3 border-t pt-4 text-[12.5px] leading-relaxed @lg:grid-cols-3" style={{ borderColor: "var(--mairo-line)" }}>
              <div>
                <dt className="font-medium text-white">Free</dt>
                <dd className="text-white/60">This plan, its concepts and the website check.</dd>
              </div>
              <div>
                <dt className="font-medium text-white">Free account</dt>
                <dd className="text-white/60">Saves and approves your plan. No card.</dd>
              </div>
              <div>
                <dt className="font-medium text-white">Paid, only to launch</dt>
                <dd className="text-white/60">When MAIRO builds and runs real campaigns. Every launch waits for your approval.</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </article>
  );
}

function Glance({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-[20px] border p-4" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)" }}>
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-1.5 truncate text-[18px] font-semibold tracking-[-0.02em] text-white">{value}</p>
      {note && <p className="mt-0.5 truncate text-[11.5px] text-faint">{note}</p>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-faint">{label}</dt>
      <dd className="mt-0.5 text-[14px] leading-snug text-white">{value}</dd>
    </div>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border p-3.5" style={{ borderColor: "var(--mairo-line)" }}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-violet-bright">{title}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-white/75">{children}</p>
    </div>
  );
}

const SHOW: Placement[] = ["fb-feed", "ig-feed", "stories"];

/** The walkthrough's control over one concept card: which placement shows, whether the headline is being edited and what's typed. */
export type ConceptDemo = { placement: Placement | null; editing: boolean; draft: string; pressed: string | null };

export function ConceptCard({
  index,
  concept: c,
  words,
  facts,
  businessName,
  saved,
  canSwap,
  isExample,
  signUpHref,
  onEdit,
  onSwap,
  onSave,
  demo,
}: {
  index: number;
  concept: Direction;
  words: { hook: string; headline: string; body: string };
  facts: PreviewFacts;
  businessName: string;
  saved: boolean;
  canSwap: boolean;
  isExample: boolean;
  signUpHref: string;
  onEdit: (e: Edit) => void;
  onSwap: () => void;
  onSave: () => void;
  demo?: ConceptDemo;
}) {
  const [placementState, setPlacement] = useState<Placement | null>(index === 0 ? "fb-feed" : null);
  const [editingState, setEditing] = useState(false);
  const [headlineState, setHeadline] = useState(words.headline);
  const placement = demo ? demo.placement : placementState;
  const editing = demo ? demo.editing : editingState;
  const headline = demo ? demo.draft : headlineState;
  // A button the walkthrough's cursor is pressing.
  const press = (label: string) => (demo?.pressed === label ? { transform: "scale(0.95)", filter: "brightness(1.2)" } : undefined);
  const [refining, setRefining] = useState(false);
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<{ hook: string; body: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refine() {
    if (ask.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setProposal(null);
    try {
      const res = await fetch("/api/preview/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: ask.trim(), direction: { label: c.label, hook: words.hook, body: words.body, cta: c.cta }, facts: { name: facts.name, offering: facts.offering, customer: facts.customer, location: facts.location, offer: facts.offer, proof: facts.proof, problem: facts.problem } }),
      });
      const r = (await res.json()) as { ok: true; words: { hook: string; body: string }; note: string } | { ok: false; error: string };
      if (r.ok) setProposal({ hook: r.words.hook, body: r.words.body, note: r.note });
      else setError(r.error);
    } catch {
      setError("MAIRO couldn't be reached just now. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`flex flex-col rounded-[20px] border p-4 ${c.recommended ? "border-violet-400/50" : ""}`} style={{ borderColor: c.recommended ? undefined : "var(--mairo-line)", background: c.recommended ? "linear-gradient(165deg, rgba(121,82,255,0.12), rgba(14,17,33,0.6) 55%)" : "rgba(var(--mairo-bg-rgb),0.5)" }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Concept {index + 1}</span>
        <Pill tone="muted">{c.label}</Pill>
        {c.recommended && <Pill tone="violet">Test this first</Pill>}
        {saved && <Pill tone="live">Saved</Pill>}
      </div>

      <dl className="mt-3 space-y-2.5 text-[13px] leading-relaxed">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Headline</dt>
          {editing ? (
            <dd className="mt-1 flex gap-2">
              <label htmlFor={`hl-${c.angle}`} className="sr-only">
                Headline
              </label>
              <input id={`hl-${c.angle}`} value={headline} maxLength={60} onChange={(e) => setHeadline(e.target.value)} className="min-h-[38px] w-full rounded-lg border border-white/15 bg-[#0e1122] px-2.5 text-[13.5px] text-white outline-none focus:border-violet-400/70" />
              <button
                type="button"
                className="shrink-0 rounded-lg bg-white/[0.08] px-3 text-[12.5px] text-white hover:bg-white/[0.12]"
                style={press("Done")}
                onClick={() => {
                  onEdit({ headline: headline.trim() || words.headline });
                  setEditing(false);
                }}
              >
                Done
              </button>
            </dd>
          ) : (
            <dd className="mt-0.5 text-[15px] font-semibold text-white">{words.headline}</dd>
          )}
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Ad copy</dt>
          <dd className="mt-0.5 text-white/85">{words.body}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Visual direction</dt>
          <dd className="mt-0.5 text-white/70">{c.visual}</dd>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <div>
            <dt className="inline text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Button </dt>
            <dd className="inline text-white/85">{c.cta}</dd>
          </div>
          <div>
            <dt className="inline text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Works as </dt>
            <dd className="inline text-white/70">{c.format}</dd>
          </div>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-faint">Why MAIRO recommends it</dt>
          <dd className="mt-0.5 text-white/70">{c.why}</dd>
        </div>
      </dl>

      {/* Placements: MAIRO's own mock-ups, the same ones the app's Creative Studio uses. */}
      <div className="mt-4">
        <div role="group" aria-label="Preview placements" className="flex flex-wrap gap-1.5">
          {SHOW.map((pl) => (
            <button key={pl} type="button" aria-pressed={placement === pl} onClick={() => setPlacement(placement === pl ? null : pl)} style={press(pl)} className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${placement === pl ? "border-violet-400/60 bg-violet-500/15 text-white" : "border-white/10 text-white/65 hover:text-white"}`}>
              {pl === "fb-feed" ? "Facebook feed" : pl === "ig-feed" ? "Instagram feed" : "Instagram Story"}
            </button>
          ))}
        </div>
        {placement && (
          <figure className="mt-3">
            <div className={placement === "stories" ? "mx-auto max-w-[220px]" : ""}>
              <PlacementMock placement={placement} media={{ kind: "none" }} words={{ hook: words.hook, body: words.body === words.hook ? "" : words.body.replace(words.hook, "").trim(), cta: c.cta }} businessName={businessName} />
            </div>
            <figcaption className="mt-2 text-[11.5px] leading-relaxed text-faint">Concept preview. {mockLabel(placement, { kind: "none" })}</figcaption>
          </figure>
        )}
      </div>

      {!isExample && (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3.5" style={{ borderColor: "var(--mairo-line)" }}>
            <button type="button" onClick={() => setRefining((v) => !v)} style={press("Refine")} className="rounded-full bg-[image:var(--mairo-ramp)] px-3 py-1.5 text-[12px] font-semibold text-white">
              Refine with MAIRO
            </button>
            <button type="button" onClick={() => setEditing(true)} style={press("Edit headline")} className="rounded-full border border-white/12 px-3 py-1.5 text-[12px] text-white/85 hover:text-white">
              Edit headline
            </button>
            {canSwap && (
              <button type="button" onClick={onSwap} className="rounded-full border border-white/12 px-3 py-1.5 text-[12px] text-white/85 hover:text-white">
                Change direction
              </button>
            )}
            <button type="button" onClick={onSave} aria-pressed={saved} style={press("Save concept")} className="rounded-full border border-white/12 px-3 py-1.5 text-[12px] text-white/85 hover:text-white">
              {saved ? "Saved ✓" : "Save concept"}
            </button>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
            Upload your own image or video in Creative Studio after you{" "}
            <Link href={signUpHref} className="text-violet-200 underline-offset-2 hover:underline">
              create your free account
            </Link>
            . Saved concepts carry over.
          </p>
          {refining && (
            <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: "var(--mairo-line)" }}>
              <label htmlFor={`rf-${c.angle}`} className="text-[12.5px] font-medium text-white">
                What should MAIRO change?
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id={`rf-${c.angle}`}
                  value={ask}
                  maxLength={240}
                  onChange={(e) => setAsk(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void refine();
                    }
                  }}
                  placeholder="e.g. Make it shorter and more premium"
                  className="min-h-[38px] w-full rounded-lg border border-white/15 bg-[#0e1122] px-2.5 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-violet-400/70"
                />
                <button type="button" disabled={busy || ask.trim().length < 3} onClick={() => void refine()} className="shrink-0 rounded-lg bg-white/[0.08] px-3 text-[12.5px] text-white hover:bg-white/[0.12] disabled:opacity-50">
                  {busy ? "Working…" : "Ask"}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Make it shorter", "Make it more premium", "Focus on the offer", "Speak to families"].map((chip) => (
                  <button key={chip} type="button" onClick={() => setAsk(chip)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11.5px] text-white/65 hover:text-white">
                    {chip}
                  </button>
                ))}
              </div>
              {error && (
                <p role="alert" className="mt-2 text-[12.5px] text-amber-200">
                  {error}
                </p>
              )}
              {proposal && (
                <div className="mt-3 rounded-xl bg-violet-500/[0.08] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-200">MAIRO&rsquo;s proposal</p>
                  <p className="mt-1 text-[13.5px] font-semibold text-white">{proposal.hook}</p>
                  {proposal.body && <p className="mt-1 text-[12.5px] text-white/80">{proposal.body}</p>}
                  <p className="mt-1.5 text-[11.5px] text-white/55">{proposal.note}</p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-white/[0.1] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/[0.15]"
                      onClick={() => {
                        onEdit({ hook: proposal.hook, body: [proposal.hook, proposal.body].filter(Boolean).join(" ") });
                        setProposal(null);
                        setRefining(false);
                        setAsk("");
                      }}
                    >
                      Keep it
                    </button>
                    <button type="button" className="rounded-full px-3 py-1.5 text-[12px] text-white/65 hover:text-white" onClick={() => setProposal(null)}>
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </li>
  );
}

/** Refine the plan itself: the objective, the budget, who it's for and a real offer — the plan rebuilds from the new facts. */
function RefinePanel({ facts, onRefine, onEdit }: { facts: PreviewFacts; onRefine: (patch: Partial<PreviewFacts>) => void; onEdit: () => void }) {
  const [goal, setGoal] = useState<PreviewGoal | "">(facts.goal);
  const [budget, setBudget] = useState(facts.monthlyBudget ? String(facts.monthlyBudget) : "");
  const [customer, setCustomer] = useState(facts.customer);
  const [offer, setOffer] = useState(facts.offer);
  const [done, setDone] = useState(false);
  const input = "min-h-[42px] w-full rounded-xl border border-white/12 bg-[#0e1122]/80 px-3 text-[14px] text-white outline-none placeholder:text-white/35 focus:border-violet-400/70";
  return (
    <Panel id="pl-refine" title="Refine your plan with MAIRO" style={{ scrollMarginTop: 96 }}>
      <p className="-mt-1 max-w-[760px] text-[13.5px] leading-relaxed text-white/70">Change the objective, the budget, who it&rsquo;s for or a real offer, and MAIRO rebuilds the plan from your new answers. To change a concept&rsquo;s words, use Refine with MAIRO on the concept.</p>
      <div className="mt-4 grid gap-3 @md:grid-cols-2">
        <div>
          <label htmlFor="rf-goal" className="mb-1 block text-[12px] text-muted">
            Objective
          </label>
          <select id="rf-goal" value={goal} onChange={(e) => setGoal(e.target.value as PreviewGoal)} className={input}>
            <option value="sales" className="bg-[#111426]">Sales</option>
            <option value="leads" className="bg-[#111426]">Leads</option>
            <option value="bookings" className="bg-[#111426]">Bookings</option>
          </select>
        </div>
        <div>
          <label htmlFor="rf-budget" className="mb-1 block text-[12px] text-muted">
            Monthly ad budget ($)
          </label>
          <input id="rf-budget" value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="numeric" maxLength={9} placeholder="e.g. 600" className={input} />
        </div>
        <div>
          <label htmlFor="rf-customer" className="mb-1 block text-[12px] text-muted">
            Who it&rsquo;s for
          </label>
          <input id="rf-customer" value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={90} placeholder="e.g. Homeowners, new parents" className={input} />
        </div>
        <div>
          <label htmlFor="rf-offer" className="mb-1 block text-[12px] text-muted">
            A current offer (only one you really run)
          </label>
          <input id="rf-offer" value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={90} placeholder="Optional" className={input} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          className={primaryAction}
          onClick={() => {
            const n = Number(budget.replace(/[^0-9.]/g, ""));
            const patch: Partial<PreviewFacts> = { goal: goal || facts.goal, monthlyBudget: Number.isFinite(n) && n > 0 ? Math.round(n) : null, customer: customer.trim(), offer: offer.trim() };
            onRefine(patch);
            setDone(true);
          }}
        >
          Rebuild my plan
        </button>
        <button type="button" onClick={onEdit} className={quietAction}>
          Edit all details
        </button>
        {done && (
          <p role="status" className="text-[12.5px] text-emerald-300">
            Rebuilt from your answers.
          </p>
        )}
      </div>
    </Panel>
  );
}
