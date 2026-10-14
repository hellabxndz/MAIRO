"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BUSINESS_TYPES, businessTypeFrom } from "@/lib/onboarding/business-types";
import { EXAMPLES, EXAMPLE_ORDER, type ExampleType } from "@/lib/demo/examples";
import { FACT_HINT, FACT_LABEL, buildPreview, defaultGoal, emptyFacts, factsFromInstagram, factsFromScan, missingFacts, previewKind, type FactKey, type Preview, type PreviewFacts, type PreviewGoal } from "@/lib/preview/build";
import { analysisSteps, growthActions, opportunities } from "@/lib/preview/consult";
import type { InstagramRead } from "@/lib/website/instagram";
import { exampleFacts } from "@/lib/preview/example";
import { saveHandoff } from "@/lib/tools/handoff";
import { heroVariant, track } from "@/lib/analytics/track";
import type { Finding } from "@/lib/website/audit";
import { useWebsiteScan } from "@/components/tools/use-website-scan";
import { ScanError, ScanProgressView } from "@/components/tools/website-report";
import { inputCls, primaryBtn, secondaryBtn } from "@/components/tools/ui";
import { FreePlanForm, type FreePlanStart } from "./free-plan-form";
import { PlanView } from "./plan-view";

// The free ad plan — started with Build My Free Ad Plan: a few facts about
// the business, its Instagram profile's public preview, or its website read by
// MAIRO's server (every progress line a real step). Then what MAIRO found,
// shown with where it found it, gaps asked about rather than guessed; five
// analysis steps, each showing what it actually produced; and a free plan
// built only from what the visitor confirmed — business overview,
// opportunities, strategy, three creative concepts and growth actions —
// presented in the same console the app uses. Refining it, and approving it
// in a free account, follow. The facts travel into setup with the visitor's
// say-so.
//
// The draft is kept in this browser (localStorage) so a visitor who leaves
// comes back to it. Nothing typed here is sent anywhere until they read a
// website (the address goes to MAIRO's server) or sign up.

const DRAFT_KEY = "mairo:preview:v1";
type Stage = "start" | "reading" | "instagram" | "confirm" | "analyzing" | "preview";
type Draft = { facts: PreviewFacts; stage: "confirm" | "preview"; top: Finding[]; at: string };
type Origin = "url" | "manual" | "example" | "instagram";

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

export function PreviewFlow({
  initialWebsite,
  initialExample,
  initialType,
  initialManual = false,
  initialDescribe = null,
  initialName = null,
  initialInstagram = null,
  initialGoal = "",
  initialBudget = null,
}: {
  initialWebsite: string | null;
  initialExample: ExampleType | null;
  initialType: string | null;
  initialManual?: boolean;
  initialDescribe?: string | null;
  initialName?: string | null;
  initialInstagram?: string | null;
  initialGoal?: PreviewGoal | "";
  initialBudget?: number | null;
}) {
  const { state: scan, run } = useWebsiteScan();
  const stored = useSyncExternalStore(noSubscribe, readDraft, () => null);
  const draft = useMemo<Draft | null>(() => {
    if (!stored || initialWebsite || initialExample || initialManual || initialDescribe || initialName || initialInstagram) return null;
    try {
      return JSON.parse(stored) as Draft;
    } catch {
      return null;
    }
  }, [stored, initialWebsite, initialExample, initialManual, initialDescribe, initialName, initialInstagram]);

  const startedManual = initialManual || Boolean(initialDescribe) || Boolean(initialName);
  const startFacts = startedManual ? withChoices(described(emptyFacts(null), initialDescribe, initialName), { goal: initialGoal, type: initialType ?? "", budget: initialBudget }) : null;
  // Everything needed came in with the form: straight to the analysis, no questions.
  const [stage, setStage] = useState<Stage | null>(initialExample ? "preview" : startFacts ? (ready(startFacts) ? "analyzing" : "confirm") : null);
  // Asked once for the details three concepts need; after that the visitor may build with what they gave.
  const [askedMore, setAskedMore] = useState(false);
  const [facts, setFacts] = useState<PreviewFacts | null>(() => (initialExample ? exampleFacts(initialExample) : startFacts));
  const [origin, setOrigin] = useState<Origin>(initialExample ? "example" : startedManual ? "manual" : "url");
  // What the visitor chose before MAIRO read anything — their objective, industry and budget win over what the website suggests.
  const choices = useRef<Pick<FreePlanStart, "goal" | "type" | "budget">>({ goal: initialGoal, type: initialType ?? "", budget: initialBudget });
  const [top, setTop] = useState<Finding[]>([]);
  const [url, setUrl] = useState(initialWebsite ?? "");
  const [insta, setInsta] = useState<{ handle: string; read: InstagramRead | null; busy: boolean }>({ handle: initialInstagram ?? "", read: null, busy: false });
  const [handle, setHandle] = useState<string | null>(null);
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
    async (address: string, base: PreviewFacts | null = null) => {
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
      const f = withChoices(merge(factsFromScan(r), base), choices.current);
      const t = r.audit.top.filter((x) => x.status === "issue").slice(0, 3);
      setFacts(f);
      setTop(t);
      setStage("confirm");
      persist(f, "confirm", t);
      track({ name: "preview_result", props: { outcome: "facts", variant: variant.current } });
    },
    [run, persist],
  );

  const readInsta = useCallback(
    async (raw: string) => {
      setStage("instagram");
      setOrigin("instagram");
      setInsta({ handle: raw, read: null, busy: true });
      track({ name: "preview_start", props: { source: "manual", variant: variant.current } });
      let r: InstagramRead;
      try {
        const res = await fetch("/api/tools/instagram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: raw }) });
        r = (await res.json()) as InstagramRead;
      } catch {
        r = { status: "unavailable", handle: raw, message: "MAIRO couldn't reach Instagram just now. Tell MAIRO about your business instead — it takes a minute." };
      }
      setInsta({ handle: raw, read: r, busy: false });
      if (r.status === "read") {
        setHandle(r.profile.handle);
        const f = withChoices(factsFromInstagram(r.profile), choices.current);
        setFacts(f);
        setTop([]);
        setStage("confirm");
        persist(f, "confirm", []);
        track({ name: "preview_result", props: { outcome: "facts", variant: variant.current } });
      } else {
        track({ name: "preview_result", props: { outcome: "failed", variant: variant.current } });
      }
    },
    [persist],
  );

  // A website carried from the landing page is read straight away — the visitor already pressed "Build My Free Ad Plan".
  const started = useRef(false);
  useEffect(() => {
    variant.current = heroVariant();
    if (initialExample) track({ name: "preview_start", props: { source: "example", variant: variant.current } });
    if (startedManual) track({ name: "preview_start", props: { source: "manual", variant: variant.current } });
    if (initialWebsite && !started.current) {
      started.current = true;
      void read(initialWebsite);
    } else if (initialInstagram && !started.current) {
      started.current = true;
      void readInsta(initialInstagram);
    }
  }, [initialWebsite, initialInstagram, initialExample, startedManual, read, readInsta]);

  useEffect(() => {
    heading.current?.focus();
  }, [shown]);

  // Stable, so the analysis' step timers aren't restarted by a re-render.
  const toPlan = useCallback(() => setStage("preview"), []);

  const startManual = (describe: string | null = null, name: string | null = null) => {
    const f = withChoices(described(emptyFacts(null), describe, name), choices.current);
    setFacts(f);
    setTop([]);
    setOrigin("manual");
    setStage(ready(f) ? "analyzing" : "confirm");
    track({ name: "preview_start", props: { source: "manual", variant: variant.current } });
    track({ name: "preview_result", props: { outcome: "manual", variant: variant.current } });
  };

  const begin = (st: FreePlanStart) => {
    choices.current = { goal: st.goal, type: st.type, budget: st.budget };
    if (st.website) {
      setUrl(st.website);
      void read(st.website);
    } else if (st.instagram) void readInsta(st.instagram);
    else startManual(st.describe, st.name);
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

  const build = (anyway = false) => {
    if (!current) return;
    const missing = missingFacts(current);
    if (missing.length) {
      setProblems(missing.map((m) => m.ask));
      return;
    }
    if (!anyway && !askedMore && conceptCount(current) < 3) {
      setAskedMore(true);
      return;
    }
    setProblems([]);
    setStage("analyzing");
    persist(current, "preview", findings);
    const k = previewKind(current.businessType, Boolean(current.destinations?.booking));
    track({ name: "preview_complete", props: { kind: k, variant: variant.current } });
  };

  const refine = (patch: Partial<PreviewFacts>) => {
    if (!current) return;
    const next: PreviewFacts = { ...current, ...patch, sources: { ...current.sources } };
    for (const k of ["customer", "offer"] as const) {
      if (k in patch) {
        if (next[k].trim()) next.sources[k] = { from: "you" };
        else delete next.sources[k];
      }
    }
    if (missingFacts(next).length) return;
    setFacts(next);
    persist(next, "preview", findings);
    track({ name: "preview_refine", props: { variant: variant.current } });
  };

  const startOver = () => {
    writeDraft(null);
    setFacts(null);
    setTop([]);
    setStage("start");
    setUrl("");
  };

  const preview: Preview | null = useMemo(() => (current && (shown === "preview" || shown === "analyzing") ? buildPreview(current) : null), [current, shown]);

  const step = shown === "start" ? 1 : shown === "reading" || shown === "instagram" ? 2 : shown === "confirm" ? 3 : 4;

  return (
    <div className={shown === "preview" ? "" : "mx-auto max-w-[980px]"}>
      {!isExample && <Steps step={step} />}

      {shown === "start" && (
        <section aria-labelledby="pv-start" className="mx-auto max-w-[760px]">
          <h1 id="pv-start" ref={heading} tabIndex={-1} className="text-[clamp(32px,5vw,52px)] font-semibold leading-[1.04] tracking-[-0.035em] text-white outline-none">Build your free ad plan</h1>
          <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-white/75">Tell us about your business, share your Instagram, or add your website. MAIRO analyzes the information available, identifies advertising opportunities, and builds a personalized AI advertising plan around your goals.</p>
          <div className="mt-7">
            <FreePlanForm onStart={begin} initial={{ goal: initialGoal, type: initialType ?? "", budget: initialBudget }} idPrefix="pv" />
          </div>
          <p className="mt-3 text-[12.5px] text-white/50">MAIRO reads public pages only — never anything behind a login. Free plans are limited to 5 website or Instagram readings an hour per visitor.</p>
          <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13.5px]">
            <span className="text-white/45">Or see an example plan:</span>
            {EXAMPLE_ORDER.map((k) => (
              <Link key={k} href={`/preview?example=${k}`} className="text-white/75 underline underline-offset-4 hover:text-white">{EXAMPLES[k].label}</Link>
            ))}
          </p>
        </section>
      )}

      {shown === "reading" && (
        <section aria-labelledby="pv-reading">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Step 1 · MAIRO analyzes your business</p>
          <h1 id="pv-reading" ref={heading} tabIndex={-1} className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-white outline-none sm:text-[34px]">Reading {url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</h1>
          <div className="mt-5">
            {scan.phase === "running" && <ScanProgressView progress={scan.progress} />}
            {scan.phase === "error" && (
              <div className="space-y-3">
                <ScanError message={scan.message} />
                <Recover onRetry={() => void read(url)} onManual={() => startManual()} canRetry={!scan.limit} />
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
                <Recover onRetry={() => void read(url)} onManual={() => startManual()} canRetry={!scan.result.socialInstead && scan.result.status !== "BLOCKED"} />
              </div>
            )}
          </div>
        </section>
      )}

      {shown === "instagram" && (
        <section aria-labelledby="pv-insta">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Step 1 · MAIRO analyzes your business</p>
          <h1 id="pv-insta" ref={heading} tabIndex={-1} className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-white outline-none sm:text-[34px]">
            Reading @{insta.handle.replace(/^.*instagram\.com\//i, "").replace(/^@+|\/+$/g, "")} on Instagram
          </h1>
          {insta.busy ? (
            <p role="status" className="mt-5 flex items-center gap-3 text-[14.5px] text-white/80">
              <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300/40 border-t-violet-200 motion-reduce:animate-none" />
              Opening the public profile — the name, bio and link Instagram shows anyone without signing in…
            </p>
          ) : insta.read && insta.read.status !== "read" ? (
            <div className="mt-5 space-y-3">
              <ScanError message={"message" in insta.read ? insta.read.message : "Instagram didn't show this profile."} />
              <div className="flex flex-wrap gap-2">
                {insta.read.status !== "invalid" && <button type="button" onClick={() => void readInsta(insta.handle)} className={secondaryBtn}>Try again</button>}
                <button type="button" onClick={() => startManual(null, null)} className={primaryBtn}>Tell MAIRO about my business</button>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {shown === "analyzing" && current && preview && (
        <Analysis
          heading={heading}
          name={preview.name}
          steps={analysisSteps(current, preview, opportunities(current, preview, findings, handle), growthActions(current, preview, findings))}
          onDone={toPlan}
        />
      )}

      {shown === "confirm" && current && (
        <section aria-labelledby="pv-confirm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-bright">{current.website || handle ? "Step 2 · What MAIRO discovered" : "Step 2 · Your business"}</p>
          <h1 id="pv-confirm" ref={heading} tabIndex={-1} className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-white outline-none sm:text-[34px]">{current.website || handle ? "Here’s what MAIRO found" : missingFacts(current).length ? "A few more details" : "Tell MAIRO about your business"}</h1>
          <p className="mt-2 max-w-[720px] text-[14.5px] leading-relaxed text-white/70">
            {current.website ? (
              <>Each answer says where it came from. Confirm the important ones and change anything that&rsquo;s wrong — the plan uses only what you confirm here. Anything your website didn&rsquo;t say is left for you to fill in, not guessed.</>
            ) : handle ? (
              <>From @{handle}&rsquo;s public Instagram profile — each answer says so. Confirm them, fill in what Instagram didn&rsquo;t say, and the plan uses only what you confirm here.</>
            ) : (
              <>A few facts are enough for a plan. Only what you type here is used.</>
            )}
          </p>
          {handle && !current.website && insta.read?.status === "read" && insta.read.profile.website && (
            <p className="mt-3 rounded-xl border border-violet-400/25 bg-violet-500/[0.07] px-4 py-3 text-[13.5px] text-white/80">
              Your bio links to <span className="break-all font-medium text-white">{insta.read.profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>.{" "}
              <button type="button" onClick={() => { const w = insta.read?.status === "read" ? insta.read.profile.website : null; if (w) { setUrl(w); void read(w, current); } }} className="font-medium text-violet-bright underline underline-offset-4 hover:text-white">
                Read it too
              </button>{" "}
              — MAIRO checks the page your ads would send people to.
            </p>
          )}
          {current.website && (
            <p className="mt-2 text-[12.5px] text-white/50">
              Read from <span className="break-all text-white/70">{current.website}</span> ·{" "}
              <button type="button" onClick={startOver} className="underline underline-offset-2 hover:text-white">Start over</button>
            </p>
          )}

          {(current.website || handle) && <Discovered facts={current} />}

          <h2 className="mt-8 text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-bright">Step 3 · Confirm the important details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {FACT_ORDER.map((k) => (
              <FactField key={k} k={k} facts={current} read={Boolean(current.website || handle)} onChange={(v) => update({ [k]: v } as Partial<PreviewFacts>, k)} />
            ))}
            <div>
              <label htmlFor="pv-type" className="block text-[13.5px] font-medium text-white">Industry</label>
              <p className="mt-0.5 text-[12.5px] text-muted">{current.businessType && current.typeFrom === "website" ? "Suggested from your website — check it." : current.businessType && current.typeFrom === "link" ? "From the example you chose — check it." : "Decides what the campaign should count as a result."}</p>
              <select id="pv-type" value={current.businessType} onChange={(e) => {
                  update({ businessType: e.target.value, typeFrom: "you", goal: current.goal || defaultGoal(previewKind(e.target.value, Boolean(current.destinations?.booking))) });
                }} className={`${inputCls} mt-1.5`}>
                <option value="">Choose one</option>
                {BUSINESS_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pv-budget" className="block text-[13.5px] font-medium text-white">Monthly ad budget</label>
              <p className="mt-0.5 text-[12.5px] text-muted">Optional. What you&rsquo;d like to spend on ads a month, paid to Meta. Leave it empty and the plan uses an example.</p>
              <input id="pv-budget" value={current.monthlyBudget ? String(current.monthlyBudget) : ""} onChange={(e) => {
                  const n = Number(e.target.value.replace(/[^0-9]/g, ""));
                  update({ monthlyBudget: n > 0 ? n : null });
                }} inputMode="numeric" maxLength={9} placeholder="e.g. 600" className={`${inputCls} mt-1.5`} />
            </div>
          </div>

          <GoalFieldset value={current.goal} onChange={(g) => update({ goal: g })} />

          {!missingFacts(current).length && conceptCount(current) < 3 && (
            <div role={askedMore ? "alert" : undefined} className="mt-5 rounded-xl border border-violet-400/30 bg-violet-500/[0.08] px-4 py-3 text-[13.5px] text-white/85">
              <p className="font-medium text-white">For three ad concepts, MAIRO needs one or two more details.</p>
              <p className="mt-1 text-white/70">
                From what&rsquo;s here it can write {conceptCount(current) === 1 ? "one concept" : `${conceptCount(current)} concepts`}. Add any of these above — who it&rsquo;s for, a current offer, something true that builds trust, or the problem you solve — and each one gives MAIRO another angle. It never makes them up.
              </p>
              {askedMore && (
                <button type="button" onClick={() => build(true)} className="mt-2 text-[13px] font-medium text-violet-bright underline underline-offset-4 hover:text-white">
                  Build with what I&rsquo;ve given ({conceptCount(current) === 1 ? "1 concept" : `${conceptCount(current)} concepts`})
                </button>
              )}
            </div>
          )}

          {problems.length > 0 && (
            <div role="alert" className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/[0.07] px-4 py-3 text-[13.5px] text-amber-100">
              <p className="font-medium">Before MAIRO can build your plan:</p>
              <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => build()} className={primaryBtn}>Build my free plan</button>
            {!current.website && !handle && <button type="button" onClick={startOver} className={secondaryBtn}>Use my website or Instagram instead</button>}
          </div>
        </section>
      )}

      {shown === "preview" && current && preview && (
        <PlanView
          preview={preview}
          facts={current}
          findings={findings}
          instagram={handle}
          isExample={isExample}
          exampleType={initialExample}
          headingRef={heading}
          signUpHref={signUpHref(current)}
          onEdit={() => {
            setFacts(current);
            setStage("confirm");
          }}
          onRefine={refine}
          onSave={(kept) => {
            if (isExample) return;
            saveFactsForSetup(current, preview, kept);
            track({ name: "preview_save", props: { variant: variant.current } });
          }}
          onStartOver={startOver}
        />
      )}
    </div>
  );
}

const STEPS = ["Your business", "MAIRO analyzes", "Confirm", "Your free plan"];

/** The four steps of the free plan, with where the visitor is. */
export function Steps({ step }: { step: number }) {
  return (
    <ol aria-label="Progress" className="@container mx-auto mb-8 flex max-w-[760px] items-center gap-2 text-[12px]">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < step ? "done" : n === step ? "now" : "later";
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2" aria-current={state === "now" ? "step" : undefined}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${state === "done" ? "bg-emerald-400/15 text-emerald-300" : state === "now" ? "bg-[image:var(--mairo-ramp)] text-white" : "bg-white/[0.06] text-white/45"}`}>{state === "done" ? "✓" : n}</span>
            <span className={`hidden truncate @md:inline ${state === "later" ? "text-white/45" : "text-white/85"}`}>{label}</span>
            {n < STEPS.length && <span aria-hidden className="h-px min-w-3 flex-1 bg-white/10" />}
          </li>
        );
      })}
    </ol>
  );
}

/** What MAIRO discovered, card by card, each saying where it came from. `shown` reveals the first few (the walkthrough's clock). */
export function Discovered({ facts, shown }: { facts: PreviewFacts; shown?: number }) {
  const goalWord = facts.goal === "sales" ? "Online sales" : facts.goal === "bookings" ? "Bookings" : facts.goal === "leads" ? "Enquiries and leads" : null;
  const cards: { title: string; value: string | null; from: string }[] = [
    { title: "Business", value: facts.name || null, from: whereFrom(facts.sources.name?.from, "Not found") },
    { title: "Products & services", value: facts.offering || null, from: whereFrom(facts.sources.offering?.from, "Not found") },
    { title: "Audience", value: facts.customer || null, from: whereFrom(facts.sources.customer?.from, facts.website ? "Not on your website — add it below" : "Not said — add it below") },
    { title: "Likely goal", value: goalWord, from: facts.destinations?.checkout ? "Your site has a checkout" : facts.destinations?.booking ? `Your site books through ${facts.destinations.booking}` : facts.destinations?.form ? "Your site has a contact form" : "Choose it below" },
  ];
  const on = (i: number) => shown === undefined || i < shown;
  if (!facts.website) cards.pop(); // "Likely goal" reads the website's checkout, booking or form.
  return (
    <div className="@container mt-6">
      <ul className="grid gap-3 @lg:grid-cols-2 @4xl:grid-cols-4">
        {cards.map((c, i) => (
          <li key={c.title} className="rounded-[20px] border p-4 transition duration-500" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)", opacity: on(i) ? 1 : 0, transform: on(i) ? undefined : "translateY(8px)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-bright">{c.title}</p>
            <p className={`mt-1.5 text-[14.5px] leading-snug ${c.value ? "text-white" : "text-white/40"}`}>{c.value ?? "—"}</p>
            <p className="mt-1.5 text-[11.5px] text-faint">{c.from}</p>
          </li>
        ))}
        {facts.pixelSeen !== null && (
          <li className="rounded-[20px] border p-4 @lg:col-span-2 @4xl:col-span-4" style={{ borderColor: "var(--mairo-line)", opacity: on(cards.length) ? 1 : 0 }}>
            <p className="text-[13px] text-white/75">
              <span className="font-medium text-white">Opportunity:</span> {facts.pixelSeen ? "a Meta pixel is on your website — setup checks it reports the right events." : "no Meta pixel was found on the pages read — the plan includes adding one, so Meta can see what your ads lead to."}
            </p>
          </li>
        )}
      </ul>
    </div>
  );
}

/** The advertising objective, as the confirm step asks it. */
export function GoalFieldset({ value, onChange }: { value: PreviewGoal | ""; onChange: (g: PreviewGoal) => void }) {
  return (
    <fieldset className="@container mt-6">
      <legend className="text-[13.5px] font-medium text-white">Your advertising objective</legend>
      <div className="mt-2 grid gap-2 @md:grid-cols-3">
        {GOALS.map((g) => (
          <label key={g.value} className={`flex cursor-pointer flex-col rounded-xl border px-3.5 py-3 transition ${value === g.value ? "border-violet/70 bg-violet/[0.10]" : "border-white/12 bg-white/[0.02] hover:border-white/30"}`}>
            <span className="flex items-center gap-2 text-[14px] font-medium text-white">
              <input type="radio" name="pv-goal" value={g.value} checked={value === g.value} onChange={() => onChange(g.value)} className="accent-[#7952ff]" />
              {g.label}
            </span>
            <span className="mt-0.5 pl-6 text-[12.5px] text-white/60">{g.detail}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A description typed instead of a website: its first sentence is what the business offers, in the owner's words; the name as given. */
function described(f: PreviewFacts, text: string | null, name: string | null = null): PreviewFacts {
  const out: PreviewFacts = { ...f, sources: { ...f.sources } };
  const n = (name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (n) {
    out.name = n;
    out.sources.name = { from: "you" };
  }
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return out;
  // "We sell premium streetwear clothing for young adults." → "Premium streetwear clothing for young adults"
  const first = (t.match(/^[^.!?]+[.!?]?/)?.[0] ?? t).trim().replace(/[.!]+$/, "").replace(/^(?:we|i)\s+(?:sell|offer|make|provide|do|run)\s+/i, "").slice(0, 140);
  out.offering = first.charAt(0).toUpperCase() + first.slice(1);
  out.sources.offering = { from: "you" };
  // "… for young adults" names who it's for, in the owner's own words.
  const forWhom = first.match(/\bfor\s+((?:[a-z'-]+\s?){1,5})$/i)?.[1]?.trim();
  if (forWhom && !/^(?:you|everyone|all|less|more|free|sale)\b/i.test(forWhom) && !out.customer) {
    out.customer = forWhom.charAt(0).toUpperCase() + forWhom.slice(1);
    out.sources.customer = { from: "you" };
  }
  return out;
}

/** How many ad concepts these facts support — each angle needs a fact of its own; none is invented. */
function conceptCount(f: PreviewFacts): number {
  return buildPreview(f)?.directions.length ?? 0;
}

/** Enough to go straight to the analysis: nothing required missing, and three concepts' worth of facts. */
function ready(f: PreviewFacts): boolean {
  return missingFacts(f).length === 0 && conceptCount(f) >= 3;
}

/**
 * A website reading on top of what the visitor already has (from their
 * Instagram profile, or typed): what they have stays, and the website fills
 * the gaps — plus everything only a website gives (its pages, pixel, links).
 */
function merge(read: PreviewFacts, base: PreviewFacts | null): PreviewFacts {
  if (!base) return read;
  const out: PreviewFacts = { ...read, sources: { ...read.sources } };
  for (const k of FACT_ORDER) {
    if (base[k].trim()) {
      out[k] = base[k];
      if (base.sources[k]) out.sources[k] = base.sources[k];
      else delete out.sources[k];
    }
  }
  if (base.businessType) Object.assign(out, { businessType: base.businessType, typeFrom: base.typeFrom });
  if (base.goal) out.goal = base.goal;
  if (base.monthlyBudget) out.monthlyBudget = base.monthlyBudget;
  return out;
}

function whereFrom(from: string | undefined, otherwise: string): string {
  return from === "website" ? "From your website" : from === "instagram" ? "From your Instagram profile" : from === "you" ? "You entered" : otherwise;
}

/** The visitor's own choices — objective, industry, budget — over anything a website suggested. */
function withChoices(f: PreviewFacts, c: { goal: PreviewGoal | ""; type: string; budget: number | null }): PreviewFacts {
  const out: PreviewFacts = { ...f };
  if (c.type && businessTypeFrom(c.type)) Object.assign(out, { businessType: c.type, typeFrom: "you" as const });
  if (c.goal) out.goal = c.goal;
  else if (!out.goal && out.businessType) out.goal = defaultGoal(previewKind(out.businessType, Boolean(out.destinations?.booking)));
  if (c.budget && c.budget > 0) out.monthlyBudget = c.budget;
  return out;
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
  if (src?.from === "instagram") return <span className="rounded-full bg-pink-400/12 px-2 py-0.5 text-[11px] font-medium text-pink-200">From your Instagram</span>;
  if (src?.from === "you") return <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[11px] font-medium text-violet-bright">You entered</span>;
  if (src?.from === "example") return <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-medium text-amber-200">Example</span>;
  if (read && REQUIRED.has(k)) return <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-medium text-amber-200">Not found — please add</span>;
  if (read) return <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/55">Not found · optional</span>;
  return REQUIRED.has(k) ? null : <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] text-white/55">Optional</span>;
}

function FactField({ k, facts, read, onChange }: { k: FactKey; facts: PreviewFacts; read: boolean; onChange: (v: string) => void }) {
  const id = `pv-${k}`;
  const src = facts.sources[k];
  const quote = src?.from === "website" || src?.from === "instagram" ? src.quote : null;
  return (
    <div className={k === "offering" ? "sm:col-span-2" : ""}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13.5px] font-medium text-white">{FACT_LABEL[k]}</label>
        <SourceChip k={k} facts={facts} read={read} />
      </div>
      <p className="mt-0.5 text-[12.5px] text-muted">{FACT_HINT[k]}</p>
      <input id={id} value={facts[k]} onChange={(e) => onChange(e.target.value)} maxLength={k === "offering" ? 140 : 90} className={`${inputCls} mt-1.5`} aria-describedby={quote ? `${id}-q` : undefined} />
      {quote && quote.replace(/[.!]+$/, "") !== facts[k] && (
        <p id={`${id}-q`} className="mt-1 text-[12px] leading-relaxed text-white/50">{src?.from === "instagram" ? "Your bio says" : "Your website says"}: &ldquo;{quote.slice(0, 200)}&rdquo;</p>
      )}
    </div>
  );
}

/** Puts the confirmed facts where setup will offer them — the owner still chooses to use each one. */
function saveFactsForSetup(f: PreviewFacts, p: Preview, kept: { hook: string }[] = []) {
  if (f.website) saveHandoff({ kind: "website", url: f.website, tool: "preview" });
  if (f.offer.trim()) saveHandoff({ kind: "offer", offer: f.offer.trim(), tool: "preview" });
  const hooks = [...kept.map((k) => k.hook), ...p.directions.map((d) => d.hook)].filter((h, i, all) => all.indexOf(h) === i).slice(0, 5);
  if (hooks.length) saveHandoff({ kind: "hooks", hooks, tool: "preview" });
  const about = [f.monthlyBudget && `Monthly ad budget they gave: $${f.monthlyBudget}`, f.offering && `Offer: ${f.offering}`, f.customer && `For: ${f.customer}`, f.location && `Where: ${f.location}`, f.proof && `Trust: ${f.proof}`, f.problem && `Problem solved: ${f.problem}`].filter(Boolean).join(" · ");
  if (about) saveHandoff({ kind: "note", label: "Your business, from your free plan", text: about.slice(0, 600), tool: "preview" });
}

function signUpHref(f: PreviewFacts): string {
  const q = new URLSearchParams({ from: "preview" });
  if (f.businessType) q.set("type", f.businessType);
  if (f.website) q.set("website", f.website);
  return `/sign-up?${q.toString()}`;
}

/**
 * The five analysis steps, each with what it produced. The work is already
 * done when this appears — the plan is built from the facts in one go — so
 * the steps are revealed one after another as a readable account of it, and
 * every result line is the real output, never a placeholder. With reduced
 * motion they appear together.
 */
function Analysis({ heading, name, steps, onDone }: { heading: React.RefObject<HTMLHeadingElement | null>; name: string; steps: { label: string; result: string }[]; onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const done = shown >= steps.length;
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce && shown < steps.length) {
      const t = window.setTimeout(() => setShown(steps.length), 0);
      return () => window.clearTimeout(t);
    }
    if (shown < steps.length) {
      const t = window.setTimeout(() => setShown((n) => n + 1), shown === 0 ? 350 : 650);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(onDone, 1100);
    return () => window.clearTimeout(t);
  }, [shown, steps.length, onDone]);

  return (
    <section aria-labelledby="pv-analyzing" className="mx-auto max-w-[760px]">
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-bright">MAIRO is building your plan</p>
      <h1 id="pv-analyzing" ref={heading} tabIndex={-1} className="mt-2 text-[28px] font-semibold tracking-[-0.02em] text-white outline-none sm:text-[34px]">
        {done ? `${name}: your plan is ready` : `Working on ${name}…`}
      </h1>
      <ol className="mt-6 space-y-3" aria-live="polite">
        {steps.map((s, i) => {
          const state = i < shown ? "done" : i === shown ? "now" : "later";
          return (
            <li key={s.label} className={`flex gap-3.5 rounded-2xl border px-4 py-3.5 transition duration-500 ${state === "later" ? "opacity-40" : "opacity-100"}`} style={{ borderColor: state === "done" ? "rgba(52,211,153,0.25)" : "var(--mairo-line)", backgroundImage: "var(--mairo-glass)" }}>
              <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${state === "done" ? "bg-emerald-400/15 text-emerald-300" : state === "now" ? "bg-[image:var(--mairo-ramp)] text-white" : "bg-white/[0.06] text-white/45"}`}>
                {state === "done" ? "✓" : state === "now" ? <span className="h-2 w-2 animate-pulse rounded-full bg-white motion-reduce:animate-none" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-white">{s.label}{state === "done" ? "" : "…"}</span>
                {state === "done" && <span className="mt-0.5 block text-[13.5px] leading-relaxed text-white/70">{s.result}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onDone} className={primaryBtn}>{done ? "See my plan" : "Skip to my plan"}</button>
        <p className="text-[12.5px] text-white/50">Built only from what you confirmed. Nothing is spent, and nothing runs, until you approve it.</p>
      </div>
    </section>
  );
}
