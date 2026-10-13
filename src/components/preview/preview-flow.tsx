"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { BUSINESS_TYPES } from "@/lib/onboarding/business-types";
import { EXAMPLES, EXAMPLE_ORDER, type ExampleType } from "@/lib/demo/examples";
import { FACT_HINT, FACT_LABEL, buildPreview, defaultGoal, emptyFacts, factsFromScan, missingFacts, previewKind, type FactKey, type Preview, type PreviewFacts, type PreviewGoal } from "@/lib/preview/build";
import { exampleFacts } from "@/lib/preview/example";
import { saveHandoff } from "@/lib/tools/handoff";
import { heroVariant, track } from "@/lib/analytics/track";
import type { Finding } from "@/lib/website/audit";
import { useWebsiteScan } from "@/components/tools/use-website-scan";
import { FindingCard, ScanError, ScanProgressView } from "@/components/tools/website-report";
import { inputCls, primaryBtn, secondaryBtn } from "@/components/tools/ui";
import { PLANS, STARTER_TRIAL_DAYS } from "@/lib/plans";

// The campaign preview: the visitor's own website read by MAIRO's server
// (every progress line is a real step), the facts it found shown with where
// it found them, gaps asked about rather than guessed, and a first draft of
// the plan built from what the visitor confirmed. Saving it is a free account
// — the facts travel into setup with the visitor's say-so.
//
// The draft is kept in this browser (localStorage) so a visitor who leaves
// comes back to it. Nothing typed here is sent anywhere until they read a
// website (the address goes to MAIRO's server) or sign up.

const DRAFT_KEY = "mairo:preview:v1";
type Stage = "start" | "reading" | "confirm" | "preview";
type Draft = { facts: PreviewFacts; stage: "confirm" | "preview"; top: Finding[]; at: string };
type Origin = "url" | "manual" | "example";

const noSubscribe = () => () => {};
function readDraft(): string | null {
  try {
    return window.localStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}
function writeDraft(d: Draft | null) {
  try {
    if (d) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage blocked: the preview works, it just isn't remembered.
  }
}

const GOALS: { value: PreviewGoal; label: string; detail: string }[] = [
  { value: "sales", label: "Sales", detail: "People buy on your website" },
  { value: "leads", label: "Leads", detail: "People ask for a quote or call" },
  { value: "bookings", label: "Bookings", detail: "People book a time" },
];
const FACT_ORDER: FactKey[] = ["name", "offering", "location", "customer", "problem", "offer", "proof"];
const REQUIRED = new Set<FactKey>(["name", "offering", "location"]);

export function PreviewFlow({ initialWebsite, initialExample, initialType, initialManual = false }: { initialWebsite: string | null; initialExample: ExampleType | null; initialType: string | null; initialManual?: boolean }) {
  const { state: scan, run } = useWebsiteScan();
  const stored = useSyncExternalStore(noSubscribe, readDraft, () => null);
  const draft = useMemo<Draft | null>(() => {
    if (!stored || initialWebsite || initialExample || initialManual) return null;
    try {
      return JSON.parse(stored) as Draft;
    } catch {
      return null;
    }
  }, [stored, initialWebsite, initialExample, initialManual]);

  const [stage, setStage] = useState<Stage | null>(initialExample ? "preview" : initialManual ? "confirm" : null);
  const [facts, setFacts] = useState<PreviewFacts | null>(() => {
    if (initialExample) return exampleFacts(initialExample);
    if (!initialManual) return null;
    const f = emptyFacts(null);
    if (initialType) Object.assign(f, { businessType: initialType, typeFrom: "link" });
    return f;
  });
  const [origin, setOrigin] = useState<Origin>(initialExample ? "example" : initialManual ? "manual" : "url");
  const [top, setTop] = useState<Finding[]>([]);
  const [url, setUrl] = useState(initialWebsite ?? "");
  const [problems, setProblems] = useState<string[]>([]);
  const variant = useRef("story");
  const heading = useRef<HTMLHeadingElement>(null);

  // The visible stage: what the visitor chose, else a saved draft, else the start.
  const shown: Stage = stage ?? (draft ? draft.stage : "start");
  const current: PreviewFacts | null = facts ?? draft?.facts ?? null;
  const findings = stage ? top : draft?.top ?? [];
  const isExample = origin === "example" && Boolean(initialExample) && stage === "preview";

  const persist = useCallback((f: PreviewFacts, s: "confirm" | "preview", t: Finding[]) => {
    if (initialExample) return; // Examples aren't drafts.
    writeDraft({ facts: f, stage: s, top: t, at: new Date().toISOString() });
  }, [initialExample]);

  const read = useCallback(
    async (address: string) => {
      setStage("reading");
      setProblems([]);
      setOrigin("url");
      track({ name: "preview_start", props: { source: "url", variant: variant.current } });
      const r = await run({ url: address });
      if (!r) {
        track({ name: "preview_result", props: { outcome: "failed", variant: variant.current } });
        return;
      }
      if (r.status === "FAILED" || r.status === "BLOCKED" || r.socialInstead) {
        track({ name: "preview_result", props: { outcome: r.status === "BLOCKED" ? "blocked" : "failed", variant: variant.current } });
        return;
      }
      const f = factsFromScan(r);
      if (initialType && !f.businessType) Object.assign(f, { businessType: initialType, typeFrom: "link" });
      const t = r.audit.top.filter((x) => x.status === "issue").slice(0, 3);
      setFacts(f);
      setTop(t);
      setStage("confirm");
      persist(f, "confirm", t);
      track({ name: "preview_result", props: { outcome: "facts", variant: variant.current } });
    },
    [run, persist, initialType],
  );

  // A website carried from the landing page is read straight away — the visitor already pressed "Preview my campaign".
  const started = useRef(false);
  useEffect(() => {
    variant.current = heroVariant();
    if (initialExample) track({ name: "preview_start", props: { source: "example", variant: variant.current } });
    if (initialManual) track({ name: "preview_start", props: { source: "manual", variant: variant.current } });
    if (initialWebsite && !started.current) {
      started.current = true;
      void read(initialWebsite);
    }
  }, [initialWebsite, initialExample, initialManual, read]);

  useEffect(() => {
    heading.current?.focus();
  }, [shown]);

  const startManual = () => {
    const f = emptyFacts(null);
    if (initialType) Object.assign(f, { businessType: initialType, typeFrom: "link" });
    setFacts(f);
    setTop([]);
    setOrigin("manual");
    setStage("confirm");
    track({ name: "preview_start", props: { source: "manual", variant: variant.current } });
    track({ name: "preview_result", props: { outcome: "manual", variant: variant.current } });
  };

  const update = (patch: Partial<PreviewFacts>, key?: FactKey) => {
    if (!current) return;
    const next: PreviewFacts = { ...current, ...patch, sources: { ...current.sources } };
    // An answer the visitor typed or corrected is theirs now; an emptied one has no source.
    if (key && next[key].trim()) next.sources[key] = { from: "you" };
    else if (key) delete next.sources[key];
    setFacts(next);
    persist(next, "confirm", findings);
  };

  const build = () => {
    if (!current) return;
    const missing = missingFacts(current);
    if (missing.length) {
      setProblems(missing.map((m) => m.ask));
      return;
    }
    setProblems([]);
    setStage("preview");
    persist(current, "preview", findings);
    const k = previewKind(current.businessType, Boolean(current.destinations?.booking));
    track({ name: "preview_complete", props: { kind: k, variant: variant.current } });
  };

  const startOver = () => {
    writeDraft(null);
    setFacts(null);
    setTop([]);
    setStage("start");
    setUrl("");
  };

  const preview: Preview | null = useMemo(() => (current && shown === "preview" ? buildPreview(current) : null), [current, shown]);

  return (
    <div className="mx-auto max-w-[980px]">
      {shown === "start" && (
        <section aria-labelledby="pv-start">
          <h1 id="pv-start" ref={heading} tabIndex={-1} className="text-[30px] font-semibold leading-[1.12] tracking-[-0.025em] text-white outline-none sm:text-[40px]">Preview a campaign for your business</h1>
          <p className="mt-3 max-w-[680px] text-[15.5px] leading-relaxed text-white/75">MAIRO reads your public website, shows you what it found and where, asks about anything it couldn&rsquo;t find, then drafts a first campaign from what you confirm. Free, and no account until you want to keep it.</p>
          <form
            className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void read(url.trim());
            }}
          >
            <label htmlFor="pv-url" className="block text-[13.5px] font-medium text-white">Enter your business website</label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input id="pv-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="yourbusiness.com" inputMode="url" autoComplete="url" maxLength={300} className={inputCls} />
              <button type="submit" className={`${primaryBtn} shrink-0`} disabled={!url.trim()}>Preview my campaign</button>
            </div>
            <p className="mt-2 text-[12px] text-white/50">MAIRO&rsquo;s server reads public pages only — never pages behind a login. Free previews are limited to 5 an hour per visitor.</p>
          </form>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px]">
            <button type="button" onClick={startManual} className="text-violet-bright underline underline-offset-4 hover:text-white">No website? Describe your business instead</button>
            <span className="text-white/45">or try an example:</span>
            {EXAMPLE_ORDER.map((k) => (
              <Link key={k} href={`/preview?example=${k}`} className="text-white/75 underline underline-offset-4 hover:text-white">{EXAMPLES[k].label}</Link>
            ))}
          </div>
        </section>
      )}

      {shown === "reading" && (
        <section aria-labelledby="pv-reading">
          <h1 id="pv-reading" ref={heading} tabIndex={-1} className="text-[28px] font-semibold tracking-[-0.02em] text-white outline-none sm:text-[34px]">Reading {url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</h1>
          <div className="mt-5">
            {scan.phase === "running" && <ScanProgressView progress={scan.progress} />}
            {scan.phase === "error" && (
              <div className="space-y-3">
                <ScanError message={scan.message} />
                <Recover onRetry={() => void read(url)} onManual={startManual} canRetry={!scan.limit} />
              </div>
            )}
            {scan.phase === "done" && (scan.result.status === "FAILED" || scan.result.status === "BLOCKED" || scan.result.socialInstead) && (
              <div className="space-y-3">
                <ScanError
                  message={
                    scan.result.socialInstead
                      ? `That's a ${scan.result.socialInstead.network} profile, not a website. MAIRO doesn't read social profiles — enter your website, or describe your business instead.`
                      : scan.result.error ?? "MAIRO couldn't read that website."
                  }
                />
                <Recover onRetry={() => void read(url)} onManual={startManual} canRetry={!scan.result.socialInstead && scan.result.status !== "BLOCKED"} />
              </div>
            )}
          </div>
        </section>
      )}

      {shown === "confirm" && current && (
        <section aria-labelledby="pv-confirm">
          <h1 id="pv-confirm" ref={heading} tabIndex={-1} className="text-[28px] font-semibold tracking-[-0.02em] text-white outline-none sm:text-[34px]">{origin === "manual" || !current.website ? "Tell MAIRO about your business" : "Check what MAIRO found"}</h1>
          <p className="mt-2 max-w-[720px] text-[14.5px] leading-relaxed text-white/70">
            {current.website ? (
              <>Each answer says where it came from. Change anything that&rsquo;s wrong — the preview uses only what you confirm here. Anything your website didn&rsquo;t say is left for you to fill in, not guessed.</>
            ) : (
              <>A few facts are enough for a first draft. Only what you type here is used.</>
            )}
          </p>
          {current.website && (
            <p className="mt-2 text-[12.5px] text-white/50">
              Read from <span className="break-all text-white/70">{current.website}</span> ·{" "}
              <button type="button" onClick={startOver} className="underline underline-offset-2 hover:text-white">Start over</button>
            </p>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {FACT_ORDER.map((k) => (
              <FactField key={k} k={k} facts={current} read={Boolean(current.website)} onChange={(v) => update({ [k]: v } as Partial<PreviewFacts>, k)} />
            ))}
            <div>
              <label htmlFor="pv-type" className="block text-[13.5px] font-medium text-white">Kind of business</label>
              <p className="mt-0.5 text-[12.5px] text-muted">{current.businessType && current.typeFrom === "website" ? "Suggested from your website — check it." : current.businessType && current.typeFrom === "link" ? "From the example you chose — check it." : "Decides what the campaign should count as a result."}</p>
              <select id="pv-type" value={current.businessType} onChange={(e) => {
                  update({ businessType: e.target.value, typeFrom: "you", goal: current.goal || defaultGoal(previewKind(e.target.value, Boolean(current.destinations?.booking))) });
                }} className={`${inputCls} mt-1.5`}>
                <option value="">Choose one</option>
                {BUSINESS_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="text-[13.5px] font-medium text-white">What should the first campaign get you?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {GOALS.map((g) => (
                <label key={g.value} className={`flex cursor-pointer flex-col rounded-xl border px-3.5 py-3 transition ${current.goal === g.value ? "border-violet/70 bg-violet/[0.10]" : "border-white/12 bg-white/[0.02] hover:border-white/30"}`}>
                  <span className="flex items-center gap-2 text-[14px] font-medium text-white">
                    <input type="radio" name="pv-goal" value={g.value} checked={current.goal === g.value} onChange={() => update({ goal: g.value })} className="accent-[#7c5cff]" />
                    {g.label}
                  </span>
                  <span className="mt-0.5 pl-6 text-[12.5px] text-white/60">{g.detail}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {problems.length > 0 && (
            <div role="alert" className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/[0.07] px-4 py-3 text-[13.5px] text-amber-100">
              <p className="font-medium">Before MAIRO can draft your campaign:</p>
              <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={build} className={primaryBtn}>Build my preview</button>
            {!current.website && <button type="button" onClick={startOver} className={secondaryBtn}>Use my website instead</button>}
          </div>
        </section>
      )}

      {shown === "preview" && current && preview && (
        <PreviewView
          preview={preview}
          facts={current}
          findings={findings}
          isExample={isExample}
          exampleType={initialExample}
          headingRef={heading}
          onEdit={() => {
            setFacts(current);
            setStage("confirm");
          }}
          onSave={() => {
            if (isExample) return;
            saveFactsForSetup(current, preview);
            track({ name: "preview_save", props: { variant: variant.current } });
          }}
          onStartOver={startOver}
        />
      )}
    </div>
  );
}

function Recover({ onRetry, onManual, canRetry }: { onRetry: () => void; onManual: () => void; canRetry: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {canRetry && <button type="button" onClick={onRetry} className={secondaryBtn}>Try again</button>}
      <button type="button" onClick={onManual} className={primaryBtn}>Describe my business instead</button>
    </div>
  );
}

function SourceChip({ k, facts, read }: { k: FactKey; facts: PreviewFacts; read: boolean }) {
  const src = facts.sources[k];
  if (src?.from === "website") return <span className="rounded-full bg-emerald-400/12 px-2 py-0.5 text-[11px] font-medium text-emerald-300">From your website</span>;
  if (src?.from === "you") return <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[11px] font-medium text-violet-bright">You entered</span>;
  if (src?.from === "example") return <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-medium text-amber-200">Example</span>;
  if (read && REQUIRED.has(k)) return <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-medium text-amber-200">Not found on your website — please add</span>;
  if (read) return <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/55">Not on your website · optional</span>;
  return REQUIRED.has(k) ? null : <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/55">Optional</span>;
}

function FactField({ k, facts, read, onChange }: { k: FactKey; facts: PreviewFacts; read: boolean; onChange: (v: string) => void }) {
  const id = `pv-${k}`;
  const src = facts.sources[k];
  const quote = src?.from === "website" ? src.quote : null;
  return (
    <div className={k === "offering" ? "sm:col-span-2" : ""}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13.5px] font-medium text-white">{FACT_LABEL[k]}</label>
        <SourceChip k={k} facts={facts} read={read} />
      </div>
      <p className="mt-0.5 text-[12.5px] text-muted">{FACT_HINT[k]}</p>
      <input id={id} value={facts[k]} onChange={(e) => onChange(e.target.value)} maxLength={k === "offering" ? 140 : 90} className={`${inputCls} mt-1.5`} aria-describedby={quote ? `${id}-q` : undefined} />
      {quote && quote.replace(/[.!]+$/, "") !== facts[k] && (
        <p id={`${id}-q`} className="mt-1 text-[12px] leading-relaxed text-white/50">Your website says: &ldquo;{quote.slice(0, 200)}&rdquo;</p>
      )}
    </div>
  );
}

/** Puts the confirmed facts where setup will offer them — the owner still chooses to use each one. */
function saveFactsForSetup(f: PreviewFacts, p: Preview) {
  if (f.website) saveHandoff({ kind: "website", url: f.website, tool: "preview" });
  if (f.offer.trim()) saveHandoff({ kind: "offer", offer: f.offer.trim(), tool: "preview" });
  if (p.directions.length) saveHandoff({ kind: "hooks", hooks: p.directions.map((d) => d.hook), tool: "preview" });
  const about = [f.offering && `Offer: ${f.offering}`, f.customer && `For: ${f.customer}`, f.location && `Where: ${f.location}`, f.proof && `Trust: ${f.proof}`, f.problem && `Problem solved: ${f.problem}`].filter(Boolean).join(" · ");
  if (about) saveHandoff({ kind: "note", label: "Your business, from your campaign preview", text: about.slice(0, 600), tool: "preview" });
}

function signUpHref(f: PreviewFacts): string {
  const q = new URLSearchParams({ from: "preview" });
  if (f.businessType) q.set("type", f.businessType);
  if (f.website) q.set("website", f.website);
  return `/sign-up?${q.toString()}`;
}

const STATE_STYLE = { done: "bg-emerald-400/15 text-emerald-300", next: "bg-violet/20 text-violet-bright", later: "bg-white/[0.07] text-white/60" } as const;
const STATE_LABEL = { done: "Done", next: "Next", later: "Later" } as const;

function PreviewView({ preview: p, facts, findings, isExample, exampleType, headingRef, onEdit, onSave, onStartOver }: { preview: Preview; facts: PreviewFacts; findings: Finding[]; isExample: boolean; exampleType: ExampleType | null; headingRef: RefObject<HTMLHeadingElement | null>; onEdit: () => void; onSave: () => void; onStartOver: () => void }) {
  const rec = p.directions[0];
  return (
    <article aria-labelledby="pv-title">
      {isExample && (
        <p className="mb-4 inline-flex rounded-full border border-amber-300/40 bg-amber-300/[0.08] px-3 py-1 text-[12.5px] font-semibold text-amber-200">Example business — sample data. No website was read.</p>
      )}
      <h1 id="pv-title" ref={headingRef} tabIndex={-1} className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-white outline-none sm:text-[36px]">
        {p.name}: your campaign preview
      </h1>
      <p className="mt-2 max-w-[760px] text-[14.5px] leading-relaxed text-white/70">
        {isExample
          ? "This is what MAIRO drafts from a business's facts. Try it with your own website to see yours."
          : `A first draft, built from ${p.builtFrom.website ? `${p.builtFrom.website} fact${p.builtFrom.website === 1 ? "" : "s"} on your website` : ""}${p.builtFrom.website && p.builtFrom.you ? " and " : ""}${p.builtFrom.you ? `${p.builtFrom.you} you entered` : ""}. It isn't a forecast — no one can promise how many customers an ad brings.`}
      </p>

      <section aria-labelledby="pv-plan" className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <h2 id="pv-plan" className="text-[18px] font-semibold text-white">The plan</h2>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Row label="Where the ads run" value={p.plan.channel} />
          <Row label="What the campaign is for" value={p.plan.objective} />
          <Row label="Where people go" value={p.plan.destination} />
          <Row label="Who sees it" value={p.plan.audience} />
          <Row label="Example budget" value={p.plan.exampleBudget} note={p.plan.budgetWhy} />
          <Row label="Why this channel" value={p.plan.why} />
        </dl>
      </section>

      <section aria-labelledby="pv-dirs" className="mt-6">
        <h2 id="pv-dirs" className="text-[18px] font-semibold text-white">{p.directions.length === 3 ? "Three ways your first ad could start" : `${p.directions.length === 1 ? "One way" : "Two ways"} your first ad could start`}</h2>
        <p className="mt-1 text-[13px] text-white/60">Opening lines written from your own words. MAIRO makes the pictures or video during setup, and you approve every ad before it runs.</p>
        <ol className="mt-4 grid gap-3 lg:grid-cols-3">
          {p.directions.map((d) => (
            <li key={d.angle} className={`flex flex-col rounded-2xl border p-4 ${d.recommended ? "border-violet/60 bg-violet/[0.07]" : "border-white/10 bg-white/[0.02]"}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/70">{d.label}</span>
                {d.recommended && <span className="rounded-full bg-violet/25 px-2 py-0.5 text-[11px] font-semibold text-violet-bright">Recommended first test</span>}
              </div>
              <p className="mt-3 text-[16px] font-semibold leading-snug text-white">&ldquo;{d.hook}&rdquo;</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-white/65">{d.why}</p>
              <p className="mt-auto pt-3 text-[12px] text-white/50">Works as: {d.format} · Button: {d.cta}</p>
            </li>
          ))}
        </ol>
        {p.couldAdd.length > 0 && !isExample && (
          <p className="mt-3 text-[13px] text-white/60">
            Want more to choose from?{" "}
            {p.couldAdd.map((c, i) => (
              <span key={c.fact}>{i ? "; " : ""}add {FACT_LABEL[c.fact].toLowerCase()} for {c.gives}</span>
            ))}
            . <button type="button" onClick={onEdit} className="text-violet-bright underline underline-offset-2 hover:text-white">Add details</button>
          </p>
        )}
        {rec && (
          <div className="mt-5 grid items-start gap-5 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
            <FeedSketch name={p.name} hook={rec.hook} cta={rec.cta} />
            <div className="text-[13.5px] leading-relaxed text-white/70">
              <p className="font-medium text-white">Why start with &ldquo;{rec.label.toLowerCase()}&rdquo;</p>
              <p className="mt-1">{rec.why}</p>
              <p className="mt-3">Your free plan sets out how to test it: what it runs against, how long before the results mean anything, and what MAIRO looks at before suggesting a change.</p>
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="pv-track" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 id="pv-track" className="text-[16px] font-semibold text-white">What Meta needs to see</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{p.tracking.status}</p>
          <ul className="mt-3 space-y-2">
            {p.tracking.events.map((e) => (
              <li key={e.name} className="rounded-lg bg-white/[0.03] px-3 py-2 text-[13px]">
                <span className="font-medium text-white">{e.name}</span> <span className="text-white/45">· {e.required ? "needed" : "useful"}</span>
                <p className="text-[12.5px] text-white/60">{e.when}</p>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="pv-ready" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 id="pv-ready" className="text-[16px] font-semibold text-white">Before anything runs</h2>
          <ol className="mt-3 space-y-2">
            {p.readiness.map((r) => (
              <li key={r.label} className="flex gap-3 text-[13px]">
                <span className={`mt-0.5 h-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATE_STYLE[r.state]}`}>{STATE_LABEL[r.state]}</span>
                <span>
                  <span className="font-medium text-white">{r.label}</span>
                  <span className="block text-[12.5px] text-white/60">{r.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {findings.length > 0 && (
        <section aria-labelledby="pv-site" className="mt-6">
          <h2 id="pv-site" className="text-[18px] font-semibold text-white">Worth fixing on your website first</h2>
          <p className="mt-1 text-[13px] text-white/60">From the pages MAIRO read. Your free plan includes the full website check.</p>
          <ul className="mt-3 grid gap-3">{findings.map((f) => <FindingCard key={f.key} f={f} compact />)}</ul>
        </section>
      )}

      <section aria-labelledby="pv-next" className="mt-8 rounded-2xl border border-violet/40 bg-violet/[0.06] p-5 sm:p-6">
        <h2 id="pv-next" className="text-[18px] font-semibold text-white">{isExample ? "See it for your business" : "Keep this plan"}</h2>
        <p className="mt-1 max-w-[720px] text-[13.5px] leading-relaxed text-white/70">
          {isExample ? "Enter your website and MAIRO drafts a preview from what it actually says." : "A free account saves these facts and turns them into your full free plan — budget, audience, testing schedule and the website check. Setup offers each fact again, and you choose what to use."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {isExample ? (
            <>
              <Link href="/preview" className={primaryBtn}>Preview my campaign</Link>
              {EXAMPLE_ORDER.filter((k) => k !== exampleType).map((k) => (
                <Link key={k} href={`/preview?example=${k}`} className={secondaryBtn}>{EXAMPLES[k].label} example</Link>
              ))}
            </>
          ) : (
            <>
              <Link href={signUpHref(facts)} onClick={onSave} className={primaryBtn}>Save my free plan</Link>
              <button type="button" onClick={onEdit} className={secondaryBtn}>Change details</button>
              <button type="button" onClick={onStartOver} className={secondaryBtn}>Start over</button>
            </>
          )}
        </div>
        <WhatsFree />
      </section>
    </article>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[12px] text-white/55">{label}</dt>
      <dd className="mt-0.5 text-[14px] leading-snug text-white">{value}</dd>
      {note && <dd className="mt-1 text-[12px] leading-relaxed text-white/50">{note}</dd>}
    </div>
  );
}

/** Where the recommended line would sit in a feed. A sketch with no picture — the picture is made, and approved, later. */
function FeedSketch({ name, hook, cta }: { name: string; hook: string; cta: string }) {
  return (
    <figure className="w-full max-w-[300px]">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#5b6cff] to-[#a78bfa] text-[12px] font-bold text-white">{name.charAt(0).toUpperCase()}</span>
          <span className="text-[12.5px] font-medium text-white">{name}<span className="block text-[10.5px] font-normal text-white/45">Sponsored</span></span>
        </div>
        <p className="px-3 pb-2.5 text-[13px] leading-snug text-white/85">{hook}</p>
        <div className="flex aspect-square items-center justify-center border-y border-dashed border-white/15 bg-white/[0.02] px-6 text-center text-[12px] text-white/45">Your picture or video goes here — made in setup, approved by you</div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-[11.5px] text-white/50">{name}</span>
          <span className="rounded-md bg-white/[0.08] px-2.5 py-1 text-[11.5px] font-medium text-white">{cta}</span>
        </div>
      </div>
      <figcaption className="mt-2 text-[12px] text-white/50">Sketch of the recommended first test in a Facebook or Instagram feed.</figcaption>
    </figure>
  );
}

export function WhatsFree() {
  return (
    <dl className="mt-5 grid gap-3 text-[12.5px] leading-relaxed sm:grid-cols-3">
      <div>
        <dt className="font-medium text-white">Free</dt>
        <dd className="text-white/60">This preview and your full advertising plan.</dd>
      </div>
      <div>
        <dt className="font-medium text-white">Free account</dt>
        <dd className="text-white/60">Keeps your plan. No card.</dd>
      </div>
      <div>
        <dt className="font-medium text-white">Paid, only to launch</dt>
        <dd className="text-white/60">A subscription when MAIRO builds and runs your campaign — from ${PLANS[0].priceMonthly} a month, with a {STARTER_TRIAL_DAYS}-day trial on {PLANS[0].name}. Your ad budget is paid to Meta.</dd>
      </div>
    </dl>
  );
}
