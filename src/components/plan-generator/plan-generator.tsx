"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useWebsiteScan } from "@/components/tools/use-website-scan";
import { factsFromScan, type PreviewGoal } from "@/lib/preview/build";
import { factsFromAnswers, toSavedPlan, type GeneratorAnswers, type Writing } from "@/lib/preview/answers";
import { buildReport, type PlanReport } from "@/lib/preview/report";
import { BUDGET_CHOICES, BUDGET_MAX, BUDGET_MIN, GOAL_OPTIONS, budgetLabel } from "@/lib/preview/strategy";
import { savedPlanSchema, type SavedPlan } from "@/lib/preview/saved-plan";
import type { ScanResult } from "@/lib/website/scan";
import { heroVariant, track } from "@/lib/analytics/track";
import { PlanReportView, type SaveState } from "./plan-report";
import { GoalIcon, IconCard, IconDoc, IconLink, IconPause, IconRocket, IconSearch, IconShield, IconSparkle, IconStore, IconTag } from "./icons";

// The Free AI Meta Ad Strategy Generator: four answers — the website, what
// the business sells, the goal and the monthly Meta ad budget — and a plan
// written for that business. On the homepage it's the hero; pressing
// Generate opens /preview, where the plan is made and shown.
//
// Every stage is real work and is ticked only when that work finishes: the
// website reading (MAIRO's server reads the public pages), then the
// opportunities, strategy and budget (worked out in this browser — instant,
// so they're shown done at once), then the ad concepts (MAIRO's AI on the
// server, or its templates, labelled), then the plan itself. No percentages,
// no waiting for show.
//
// Nothing is stored on a server until the visitor presses Save, Share or Put
// MAIRO to Work; the last plan is kept in this browser so they can come back.

const START_KEY = "mairo:plan:start";
const LAST_KEY = "mairo:plan:last:v1";
const TEMPLATES_OFF: Writing = { source: { by: "templates", why: "off" }, plan: null, dropped: [], filled: 0 };

type Last = { plan: SavedPlan; token: string | null; at: string };
type StageState = "waiting" | "working" | "done";
type Stage = { label: string; state: StageState; detail: string | null };

const STAGES = [
  "Understanding your business",
  "Identifying advertising opportunities",
  "Building your Meta advertising strategy",
  "Allocating your monthly budget",
  "Developing your first ad concepts",
  "Preparing your personalized plan",
];

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const domainOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

/** "yourbusiness.com" → "https://yourbusiness.com/"; null when it can't be a public address. */
function normalize(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!u.hostname.includes(".") || (u.protocol !== "http:" && u.protocol !== "https:")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const readOk = (r: ScanResult | null) => Boolean(r && (r.status === "OK" || r.status === "PARTIAL") && !r.socialInstead);

function storage(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}
function readLast(): Last | null {
  try {
    const raw = storage("local")?.getItem(LAST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Last;
    const p = savedPlanSchema.safeParse(v.plan);
    return p.success ? { plan: p.data, token: typeof v.token === "string" ? v.token : null, at: String(v.at) } : null;
  } catch {
    return null;
  }
}
function writeLast(l: Last | null) {
  try {
    if (l) storage("local")?.setItem(LAST_KEY, JSON.stringify(l));
    else storage("local")?.removeItem(LAST_KEY);
  } catch {
    // Storage blocked: the plan still works, it just isn't remembered here.
  }
}

export type GeneratorInitial = { website?: string | null; sells?: string; name?: string; goal?: PreviewGoal | ""; budget?: number | null; autostart?: boolean };

type Field = "website" | "sells" | "name" | "goal" | "budget";

export function PlanGenerator({ mode, initial = {} }: { mode: "hero" | "page"; initial?: GeneratorInitial }) {
  const router = useRouter();
  const { state: scanState, run: runScan } = useWebsiteScan();

  // The four answers (and the name, when no website gave it).
  const [website, setWebsite] = useState(initial.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "");
  const [noSite, setNoSite] = useState(false);
  const [sells, setSells] = useState(initial.sells ?? "");
  const [sellsFrom, setSellsFrom] = useState<"website" | null>(null);
  const [name, setName] = useState(initial.name ?? "");
  const [goal, setGoal] = useState<PreviewGoal | "">(initial.goal ?? "");
  const [goalFrom, setGoalFrom] = useState<"website" | null>(null);
  const [budget, setBudget] = useState<number | null>(initial.budget && (BUDGET_CHOICES as readonly number[]).includes(initial.budget) ? initial.budget : null);
  const [custom, setCustom] = useState(initial.budget && !(BUDGET_CHOICES as readonly number[]).includes(initial.budget) ? String(initial.budget) : "");
  const [customOn, setCustomOn] = useState(Boolean(custom));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  // The website reading, kept for the address it was made for.
  const [site, setSite] = useState<{ url: string; result: ScanResult | null; message: string | null } | null>(null);
  const reading = scanState.phase === "running";

  const [phase, setPhase] = useState<"input" | "running" | "report">("input");
  const [stages, setStages] = useState<Stage[]>(STAGES.map((label) => ({ label, state: "waiting", detail: null })));
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [report, setReport] = useState<PlanReport | null>(null);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [last, setLast] = useState<Last | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const runningHeading = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const siteFacts = site && readOk(site.result) ? factsFromScan(site.result!) : null;
  const needsName = !siteFacts?.name;
  const monthly = customOn ? Math.round(Number(custom.replace(/[^0-9.]/g, ""))) || null : budget;

  /** Reads the website once per address, and fills "What do you sell?" from it for the visitor to check. */
  const readSite = useCallback(
    async (raw: string): Promise<{ url: string; result: ScanResult | null } | null> => {
      const url = normalize(raw);
      if (!url) {
        if (raw.trim()) setErrors((e) => ({ ...e, website: "Enter a web address like yourbusiness.com — or choose “No website”." }));
        return null;
      }
      if (site && site.url === url) return site;
      setErrors((e) => ({ ...e, website: undefined }));
      track({ name: "preview_start", props: { source: "url", variant: heroVariant() } });
      const result = await runScan({ url });
      const ok = readOk(result);
      const message = !result
        ? null
        : result.socialInstead
          ? `That's a ${result.socialInstead.network} profile, not a website. Enter your website, or describe your business below.`
          : ok
            ? null
            : result.error ?? "MAIRO couldn't read that website.";
      setSite({ url, result, message });
      if (ok && result) {
        const f = factsFromScan(result);
        setSells((cur) => (!cur.trim() || sellsFrom === "website" ? f.offering : cur));
        if (f.offering) setSellsFrom((cur) => (cur === "website" || !sells.trim() ? "website" : cur));
        setGoal((cur) => {
          if (cur || !f.goal) return cur;
          setGoalFrom("website");
          return f.goal;
        });
      }
      track({ name: "preview_result", props: { outcome: ok ? "facts" : result?.status === "BLOCKED" ? "blocked" : "failed", variant: heroVariant() } });
      return { url, result };
    },
    [runScan, site, sells, sellsFrom],
  );

  const answers = (read: { url: string; result: ScanResult | null } | null): GeneratorAnswers | null => {
    const e: Partial<Record<Field, string>> = {};
    const url = noSite ? null : normalize(website);
    const readFacts = read && url && read.url === url && readOk(read.result) ? factsFromScan(read.result!) : null;
    if (!noSite && website.trim() && !url) e.website = "Enter a web address like yourbusiness.com — or choose “No website”.";
    if (!noSite && !website.trim()) e.website = "Add your website, or choose “No website” and describe your business.";
    if (sells.trim().length < 3) e.sells = "Tell MAIRO what your business sells or offers, in a few words.";
    const knownName = readFacts?.name ?? "";
    if (!knownName && !name.trim()) e.name = "What's the business called?";
    if (!goal) e.goal = "Choose the goal for your ads.";
    if (!monthly || monthly < BUDGET_MIN || monthly > BUDGET_MAX) e.budget = customOn ? `Enter a monthly amount between ${money(BUDGET_MIN)} and ${money(BUDGET_MAX)}.` : "Choose your monthly Meta ad budget.";
    setErrors(e);
    if (Object.keys(e).length) {
      const first = (["website", "sells", "name", "goal", "budget"] as Field[]).find((k) => e[k]);
      formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
      return null;
    }
    return { website: url, sells: sells.trim(), name: knownName ? "" : name.trim(), goal: goal as PreviewGoal, monthly: monthly! };
  };

  const mark = (i: number, state: StageState, detail: string | null = null) => setStages((s) => s.map((x, j) => (j === i ? { ...x, state, detail: detail ?? x.detail } : x)));

  /** The six stages, each ticked when its work is done. */
  const generate = useCallback(
    async (a: GeneratorAnswers, known: ScanResult | null) => {
      setPhase("running");
      setSave({ status: "idle" });
      setShareNote(null);
      setStages(STAGES.map((label, i) => ({ label, state: i === 0 ? "working" : "waiting", detail: null })));
      window.scrollTo({ top: 0 });

      // 1 — the website, read by MAIRO's server (or the reading already made for this address).
      // Callers pass a reading only when it's of this address.
      let scan: ScanResult | null = a.website ? known : null;
      if (a.website && !scan) scan = (await readSite(a.website))?.result ?? null;
      const ok = readOk(scan);
      mark(0, "done", ok ? `Read ${scan!.pages.length} public page${scan!.pages.length === 1 ? "" : "s"} of ${domainOf(scan!.finalUrl ?? scan!.requestedUrl)}` : a.website ? `Couldn't read ${domainOf(a.website)} — using what you told MAIRO` : "From what you told MAIRO");

      // 2–4 — worked out here from the facts: instant, so shown done as soon as they are.
      const facts = factsFromAnswers(a, ok ? scan : null);
      const provisional = toSavedPlan(a, facts, ok ? scan : null, TEMPLATES_OFF);
      const pre = provisional ? buildReport(provisional) : null;
      if (!provisional || !pre) {
        setPhase("input");
        setErrors({ sells: "MAIRO couldn't build a plan from that. Check what your business sells and try again." });
        return;
      }
      mark(1, "done", `${pre.business.opportunities.length} opportunities from your ${ok ? "website and answers" : "answers"}`);
      mark(2, "done", `${pre.strategy.objective.split(" — ")[0]} campaign · ${pre.strategy.placements.join(", ")}`);
      mark(3, "done", pre.budget.lines.map((l) => `${l.label} ${money(l.monthly)}`).join(" · "));

      // 5 — the ad concepts: MAIRO's AI on the server, checked, or its templates — and which.
      mark(4, "working");
      let w: Writing = { source: { by: "templates", why: "failed" }, plan: null, dropped: [], filled: 0 };
      try {
        const res = await fetch("/api/tools/ad-plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            facts: { name: facts.name, offering: facts.offering, customer: facts.customer, location: facts.location, offer: facts.offer, proof: facts.proof, problem: facts.problem, businessType: facts.businessType, website: facts.website, fromWebsite: provisional.facts.fromWebsite },
            goal: a.goal,
            monthly: a.monthly,
          }),
        });
        const j = (await res.json()) as Partial<Writing> & { ok?: boolean };
        if (res.ok && j.ok && j.source) w = { source: j.source, plan: j.plan ?? null, dropped: j.dropped ?? [], filled: j.filled ?? 0 };
      } catch {
        // Unreachable: the templates, labelled as such.
      }
      mark(4, "done", w.source.by === "ai" ? "Written by MAIRO's AI, then checked against your facts" : w.source.by === "fixture" ? "Local test fixture (not MAIRO's AI)" : "From MAIRO's ad templates");

      // 6 — the plan.
      const saved = toSavedPlan(a, facts, ok ? scan : null, w) ?? provisional;
      const r = buildReport(saved) ?? pre;
      mark(5, "done", "Ready");
      setPlan(saved);
      setReport(r);
      setPhase("report");
      writeLast({ plan: saved, token: null, at: new Date().toISOString() });
      track({ name: "preview_complete", props: { kind: r.goal, variant: heroVariant() } });
    },
    [readSite],
  );

  // A plan started on the homepage (or a no-JavaScript form sent there) begins at once; otherwise offer the last one.
  const started = useRef(false);
  useEffect(() => {
    if (mode !== "page" || started.current) return;
    started.current = true;
    if (initial.autostart) {
      let start: { answers: GeneratorAnswers; scan: ScanResult | null } | null = null;
      try {
        const raw = storage("session")?.getItem(START_KEY);
        storage("session")?.removeItem(START_KEY);
        if (raw) start = JSON.parse(raw);
      } catch {
        start = null;
      }
      const a: GeneratorAnswers | null = start?.answers ?? (initial.sells && initial.goal && initial.budget ? { website: initial.website ? normalize(initial.website) : null, sells: initial.sells, name: initial.name ?? "", goal: initial.goal, monthly: initial.budget } : null);
      if (a) {
        /* eslint-disable react-hooks/set-state-in-effect -- restoring the visitor's answers from the page they came from, once */
        setWebsite(a.website ? domainOf(a.website) : "");
        setNoSite(!a.website);
        setSells(a.sells);
        setName(a.name);
        setGoal(a.goal);
        if ((BUDGET_CHOICES as readonly number[]).includes(a.monthly)) setBudget(a.monthly);
        else {
          setCustomOn(true);
          setCustom(String(a.monthly));
        }
        if (start?.scan && a.website) setSite({ url: a.website, result: start.scan, message: null });
        /* eslint-enable react-hooks/set-state-in-effect */
        void generate(a, start?.scan ?? null);
        return;
      }
    }
    setLast(readLast());
    // An address carried from another page is read straight away, so "What do you sell?" is ready to check.
    if (initial.website) void readSite(initial.website);
  }, [mode, initial, generate, readSite]);

  useEffect(() => {
    if (phase === "report") heading.current?.focus();
    if (phase === "running") runningHeading.current?.focus();
  }, [phase]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // A website typed but not read yet is read first: it may give the name and what they sell.
    const url = noSite ? null : normalize(website);
    let read: { url: string; result: ScanResult | null } | null = site;
    if (url && (!site || site.url !== url)) read = await readSite(website);
    const justRead = read !== site;
    if (justRead && url && read && read.url === url && readOk(read.result) && factsFromScan(read.result!).offering && !sells.trim()) {
      // What they sell was just filled in from the website: let them see it before the plan is made.
      setErrors({});
      formRef.current?.querySelector<HTMLElement>('[data-field="sells"]')?.focus();
      return;
    }
    const a = answers(read);
    if (!a) return;
    const scan = a.website && read && read.url === a.website ? read.result : null;
    track({ name: "hero_cta", props: { cta: "free_plan", variant: heroVariant() } });
    if (mode === "hero") {
      const ss = storage("session");
      if (ss) {
        try {
          ss.setItem(START_KEY, JSON.stringify({ answers: a, scan }));
          router.push("/preview?generate=1");
          return;
        } catch {
          // Too large or blocked: the form goes as a plain request instead.
        }
      }
      formRef.current?.submit();
      return;
    }
    void generate(a, scan);
  };

  const keep = (p: SavedPlan, token: string | null) => writeLast({ plan: p, token, at: new Date().toISOString() });

  const changeBudget = (m: number) => {
    if (!plan) return;
    const next = savedPlanSchema.safeParse({ ...plan, inputs: { ...plan.inputs, monthly: m } });
    if (!next.success) return;
    const r = buildReport(next.data);
    if (!r) return;
    setPlan(next.data);
    setReport(r);
    setBudget(m);
    setCustomOn(false);
    setSave({ status: "idle" });
    setShareNote(null);
    keep(next.data, null);
  };

  const tryGoal = (g: PreviewGoal) => {
    if (!plan) return;
    setGoal(g);
    const a: GeneratorAnswers = { website: plan.inputs.website, sells: plan.inputs.sells, name: plan.facts.fromWebsite.includes("name") ? "" : plan.facts.name, goal: g, monthly: plan.inputs.monthly };
    void generate(a, a.website && site?.url === a.website ? site.result : null);
  };

  /** The answers a plan was made from, back in the form — for "Edit answers" on a plan reopened from this browser. */
  const fillFrom = (p: SavedPlan) => {
    setWebsite(p.inputs.website ? domainOf(p.inputs.website) : "");
    setNoSite(!p.inputs.website);
    setSells(p.inputs.sells);
    setSellsFrom(null);
    setName(p.facts.fromWebsite.includes("name") ? "" : p.facts.name);
    setGoal(p.inputs.goal);
    if ((BUDGET_CHOICES as readonly number[]).includes(p.inputs.monthly)) {
      setBudget(p.inputs.monthly);
      setCustomOn(false);
    } else {
      setCustomOn(true);
      setCustom(String(p.inputs.monthly));
    }
  };

  const doSave = async (): Promise<SaveState | null> => {
    if (!plan) return null;
    if (save.status === "saved") return save;
    setSave({ status: "saving" });
    try {
      const res = await fetch("/api/free-plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
      const j = (await res.json()) as { ok: boolean; token?: string; savedToAccount?: boolean; next?: string; error?: string };
      if (!res.ok || !j.ok || !j.token) {
        const s: SaveState = { status: "error", message: j.error ?? "Your plan couldn't be saved. Try again in a moment." };
        setSave(s);
        return null;
      }
      const s: SaveState = { status: "saved", token: j.token, toAccount: Boolean(j.savedToAccount), next: j.next };
      setSave(s);
      keep(plan, j.token);
      track({ name: "preview_save", props: { variant: heroVariant() } });
      return s;
    } catch {
      setSave({ status: "error", message: "Couldn't reach MAIRO to save your plan. Check your connection and try again." });
      return null;
    }
  };

  const share = async () => {
    const s = await doSave();
    if (!s?.token) return;
    const url = `${window.location.origin}/s/${s.token}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${report?.name ?? "My"} — free AI ad plan from MAIRO`, url });
        setShareNote("Shared. Anyone with the link can read this plan.");
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote(`Link copied: ${url} — anyone with it can read this plan.`);
    } catch {
      setShareNote(`Your private link: ${url} — anyone with it can read this plan.`);
    }
  };

  const work = async () => {
    setWorking(true);
    const s = await doSave();
    if (!s) {
      setWorking(false);
      return;
    }
    track({ name: "hero_cta", props: { cta: "sign_up", variant: heroVariant() } });
    router.push(s.next ?? "/sign-up?from=plan");
  };

  const signIn = async () => {
    const s = await doSave();
    if (s) router.push("/sign-in?callbackUrl=/onboarding/claim");
  };

  if (phase === "running") return <Running stages={stages} headingRef={runningHeading} progress={scanState.phase === "running" ? scanState.progress?.label ?? null : null} />;

  if (phase === "report" && report) {
    return (
      <div className="mp-print-root">
        <PlanReportView
          report={report}
          headingRef={heading}
          actions={{
            onEdit: () => setPhase("input"),
            onBudget: changeBudget,
            onGoal: tryGoal,
            onSave: () => void doSave(),
            onShare: () => void share(),
            onWork: () => void work(),
            onSignIn: () => void signIn(),
            save,
            working,
            shareNote,
          }}
        />
      </div>
    );
  }

  // An error stays only while its field is still wrong — filling it in (or the website filling it) clears it.
  const err: Partial<Record<Field, string>> = {
    website: errors.website && !noSite ? errors.website : undefined,
    sells: errors.sells && sells.trim().length < 3 ? errors.sells : undefined,
    name: errors.name && !name.trim() ? errors.name : undefined,
    goal: errors.goal && !goal ? errors.goal : undefined,
    budget: errors.budget && !(monthly && monthly >= BUDGET_MIN && monthly <= BUDGET_MAX) ? errors.budget : undefined,
  };

  const siteMessage = reading ? (scanState.phase === "running" ? scanState.progress?.label ?? "Opening your website…" : null) : null;
  const domain = normalize(website) ? domainOf(normalize(website)!) : null;
  const urlNow = noSite ? null : normalize(website);
  const siteRead = Boolean(urlNow && site && site.url === urlNow && !reading);
  const showName = noSite || (siteRead && needsName);

  // The four steps, lit as each answer is given; the first one still to do is "now".
  const steps: { label: string; field: Field; done: boolean }[] = [
    { label: "Website", field: "website", done: noSite || siteRead },
    { label: "What you sell", field: "sells", done: sells.trim().length >= 3 && (!showName || name.trim().length > 0) },
    { label: "Goal", field: "goal", done: Boolean(goal) },
    { label: "Budget", field: "budget", done: Boolean(monthly && monthly >= BUDGET_MIN && monthly <= BUDGET_MAX) },
  ];
  const now = steps.findIndex((x) => !x.done);
  const focusField = (f: Field) => formRef.current?.querySelector<HTMLElement>(`[data-field="${f}"]`)?.focus();

  const fieldBox = (bad: boolean) =>
    `flex items-center gap-3 rounded-2xl border bg-[#0a0d1c]/85 px-4 transition focus-within:border-violet-400/70 focus-within:ring-2 focus-within:ring-violet-400/20 ${bad ? "border-red-400/55" : "border-white/[0.13]"}`;
  const chip = (on: boolean) =>
    `flex cursor-pointer items-center justify-center rounded-2xl border text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet-400/50 ${on ? "border-violet-400/80 bg-violet-500/[0.18] text-white shadow-[0_0_26px_-8px_rgba(121,82,255,0.85)]" : "border-white/[0.12] bg-white/[0.025] text-white/80 hover:border-white/30 hover:text-white"}`;

  return (
    <div>
      {mode === "page" && (
        <div className="mx-auto max-w-[760px] text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-violet-400/35 bg-violet-500/[0.10] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-violet-100/90 sm:px-3.5 sm:text-[12px] sm:tracking-[0.16em]">
            <IconSparkle className="h-3.5 w-3.5 text-violet-300" /> Free AI Meta ad strategy generator
          </p>
          <h1 className="mt-5 text-[clamp(32px,5.5vw,58px)] font-semibold leading-[1.02] tracking-[-0.04em] text-white [text-wrap:balance]">
            Your Next Advertising Strategy <span className="bg-gradient-to-r from-[#8fc8ff] via-[#9d8bff] to-[#c77dff] bg-clip-text text-transparent">Starts Here.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[640px] text-[16px] leading-relaxed text-white/72">Tell MAIRO what your business sells, choose your goal and monthly ad budget, and see how your AI advertising team would grow your business.</p>
        </div>
      )}

      {last && mode === "page" && (
        <div className="mx-auto mt-8 flex max-w-[1060px] flex-col gap-3 rounded-[22px] border border-violet-400/30 bg-violet-500/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[14px] text-white/80">
            <span className="font-semibold text-white">Welcome back.</span> Your plan for {last.plan.facts.name || domainOf(last.plan.inputs.website ?? "") || "your business"} — {GOAL_OPTIONS.find((g) => g.value === last.plan.inputs.goal)?.label.toLowerCase()}, {budgetLabel(last.plan.inputs.monthly)} a month.
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                const r = buildReport(last.plan);
                if (!r) return;
                setPlan(last.plan);
                setReport(r);
                if (last.token) setSave({ status: "saved", token: last.token });
                fillFrom(last.plan);
                setPhase("report");
              }}
              className="min-h-[40px] rounded-full bg-white px-4 text-[13.5px] font-semibold text-[#111]"
            >
              Open my plan
            </button>
            <button type="button" onClick={() => { writeLast(null); setLast(null); }} className="min-h-[40px] rounded-full px-3 text-[13.5px] text-white/60 hover:text-white">
              Start a new one
            </button>
          </div>
        </div>
      )}

      <div className={`mx-auto grid max-w-[1060px] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px] ${mode === "page" ? "mt-8" : ""}`}>
        <form
          ref={formRef}
          action="/preview"
          method="get"
          onSubmit={(e) => void submit(e)}
          noValidate
          aria-label="Generate your free AI ad plan"
          className="relative min-w-0 rounded-[30px] border p-4 text-left sm:p-7"
          style={{ borderColor: "rgba(164,172,195,0.22)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-key)" }}
        >
          <input type="hidden" name="generate" value="1" />
          <div aria-hidden className="pointer-events-none absolute inset-x-12 -top-px h-px bg-gradient-to-r from-transparent via-violet-300/70 to-transparent" />

          {/* The four steps. */}
          <ol aria-label="Four quick answers" className="flex items-start pb-5">
            {steps.map((st, i) => {
              const state = st.done ? "done" : i === now ? "now" : "later";
              return (
                <li key={st.label} className="relative flex flex-1 flex-col items-center">
                  {i > 0 && <span aria-hidden className={`absolute right-1/2 top-[17px] h-px w-full ${steps[i - 1].done ? "bg-violet-400/60" : "bg-white/12"}`} />}
                  <button type="button" onClick={() => focusField(st.field)} aria-current={state === "now" ? "step" : undefined} className="group relative z-[1] flex flex-col items-center gap-1.5 outline-none">
                    <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-full border text-[13.5px] font-semibold transition group-focus-visible:ring-2 group-focus-visible:ring-violet-400/60 ${state === "done" ? "border-violet-400/70 bg-violet-500/25 text-white" : state === "now" ? "border-violet-300 bg-[#0a0d1c] text-white shadow-[0_0_18px_-2px_rgba(121,82,255,0.9)]" : "border-white/20 bg-[#0a0d1c] text-white/55"}`}>
                      {state === "done" ? <span aria-hidden>✓</span> : i + 1}
                    </span>
                    <span className={`text-center text-[11.5px] leading-tight sm:text-[12.5px] ${state === "later" ? "text-white/50" : "text-white"}`}>
                      {st.label}
                      {state === "done" && <span className="sr-only"> (done)</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div aria-hidden className="-mx-4 mb-5 h-px bg-white/[0.08] sm:-mx-7" />

          {/* 1 — website */}
          <div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`${mode}-website`} className="text-[15px] font-semibold text-white">Your website</label>
              <button
                type="button"
                onClick={() => {
                  setNoSite((v) => !v);
                  setErrors((e) => ({ ...e, website: undefined }));
                }}
                aria-pressed={noSite}
                className="text-[13px] text-violet-200/90 underline-offset-4 hover:text-white hover:underline"
              >
                {noSite ? "I have a website" : "No website?"}
              </button>
            </div>
            {noSite ? (
              <p className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[14px] text-white/75">No problem — tell MAIRO your business name and what you sell below.</p>
            ) : (
              <>
                <div className={`mt-2 ${fieldBox(Boolean(err.website))}`}>
                  <IconLink className="h-5 w-5 shrink-0 text-white/50" />
                  <input
                    id={`${mode}-website`}
                    data-field="website"
                    name="website"
                    value={website}
                    onChange={(e) => {
                      setWebsite(e.target.value);
                      setErrors((x) => ({ ...x, website: undefined }));
                    }}
                    onBlur={() => website.trim() && void readSite(website)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void readSite(website);
                      }
                    }}
                    inputMode="url"
                    autoComplete="url"
                    spellCheck={false}
                    placeholder="yourbusiness.com"
                    aria-invalid={Boolean(err.website)}
                    aria-describedby={`${mode}-website-status`}
                    className="min-h-[54px] min-w-0 flex-1 bg-transparent text-[16px] text-white placeholder:text-white/40 outline-none"
                  />
                  {reading ? (
                    <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-200 motion-reduce:animate-none" />
                  ) : siteRead && readOk(site!.result) ? (
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[12px] text-emerald-300">✓</span>
                  ) : null}
                </div>
                <p id={`${mode}-website-status`} role="status" className="mt-1.5 min-h-[18px] text-[13px] leading-snug">
                  {err.website ? (
                    <span className="text-red-300">{err.website}</span>
                  ) : reading ? (
                    <span className="text-white/70">Reading {domain ?? "your website"}: {siteMessage}</span>
                  ) : siteRead ? (
                    site!.message ? (
                      <span className="text-amber-200">{site!.message} You can still continue — MAIRO uses what you tell it.</span>
                    ) : readOk(site!.result) ? (
                      <span className="text-emerald-300/90">
                        Read {site!.result!.pages.length} public page{site!.result!.pages.length === 1 ? "" : "s"} of {domainOf(site!.url)}{siteFacts?.name ? ` — ${siteFacts.name}` : ""}.
                      </span>
                    ) : null
                  ) : (
                    <span className="text-white/50">MAIRO reads your public pages only.</span>
                  )}
                </p>
              </>
            )}
          </div>

          {/* The name, when no website said it. */}
          {showName && (
            <div className="mt-4">
              <label htmlFor={`${mode}-name`} className="text-[15px] font-semibold text-white">Business name</label>
              <div className={`mt-2 ${fieldBox(Boolean(err.name))}`}>
                <IconStore className="h-5 w-5 shrink-0 text-white/50" />
                <input
                  id={`${mode}-name`}
                  data-field="name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="organization"
                  placeholder="As your customers know it"
                  maxLength={80}
                  aria-invalid={Boolean(err.name)}
                  aria-describedby={err.name ? `${mode}-name-err` : undefined}
                  className="min-h-[52px] min-w-0 flex-1 bg-transparent text-[16px] text-white placeholder:text-white/40 outline-none"
                />
              </div>
              {err.name && <p id={`${mode}-name-err`} className="mt-1.5 text-[13px] text-red-300">{err.name}</p>}
            </div>
          )}

          {/* 2 — what they sell */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={`${mode}-sells`} className="text-[15px] font-semibold text-white">What do you sell?</label>
              {sellsFrom === "website" && sells.trim() && <span className="rounded-full bg-emerald-400/12 px-2.5 py-0.5 text-[11.5px] font-medium text-emerald-300">From your website — check it</span>}
            </div>
            <div className={`mt-2 !items-start ${fieldBox(Boolean(err.sells))}`}>
              <IconTag className="mt-[15px] h-5 w-5 shrink-0 text-white/50" />
              <textarea
                id={`${mode}-sells`}
                data-field="sells"
                name="sells"
                value={sells}
                onChange={(e) => {
                  setSells(e.target.value);
                  setSellsFrom(null);
                }}
                rows={2}
                maxLength={400}
                placeholder="Tell us what your business sells or offers…"
                aria-invalid={Boolean(err.sells)}
                aria-describedby={err.sells ? `${mode}-sells-err` : undefined}
                className="block min-h-[54px] w-full min-w-0 flex-1 resize-none bg-transparent py-3.5 text-[16px] leading-relaxed text-white placeholder:text-white/40 outline-none"
              />
            </div>
            {err.sells && <p id={`${mode}-sells-err`} className="mt-1.5 text-[13px] text-red-300">{err.sells}</p>}
          </div>

          {/* 3 — goal */}
          <fieldset className="mt-5">
            <legend className="flex w-full flex-wrap items-center justify-between gap-2 text-[15px] font-semibold text-white">
              <span>Your advertising goal</span>
              {goalFrom === "website" && goal && <span className="rounded-full bg-emerald-400/12 px-2.5 py-0.5 text-[11.5px] font-medium text-emerald-300">Suggested from your website</span>}
            </legend>
            {/* Phones: two columns of icon-and-label rows, the fifth across both; wider: five cards in a row. */}
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5" data-field="goal" tabIndex={-1}>
              {GOAL_OPTIONS.map((g, i) => (
                <label key={g.value} className={`${chip(goal === g.value)} min-h-[56px] !justify-start gap-2.5 px-3 py-2.5 text-left sm:min-h-[92px] sm:flex-col sm:!justify-center sm:gap-2 sm:px-2 sm:py-3 sm:text-center ${i === GOAL_OPTIONS.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}>
                  <input type="radio" name="goal" value={g.value} checked={goal === g.value} onChange={() => { setGoal(g.value); setGoalFrom(null); setErrors((e) => ({ ...e, goal: undefined })); }} className="sr-only" />
                  <GoalIcon goal={g.value} className={`h-6 w-6 shrink-0 ${goal === g.value ? "text-violet-200" : "text-white/60"}`} />
                  <span className="text-[13px] font-medium leading-tight">{g.label}</span>
                </label>
              ))}
            </div>
            {err.goal && <p className="mt-1.5 text-[13px] text-red-300">{err.goal}</p>}
          </fieldset>

          {/* 4 — monthly Meta budget */}
          <fieldset className="mt-5">
            <legend className="text-[15px] font-semibold text-white">Monthly Meta ads budget</legend>
            <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-6" data-field="budget" tabIndex={-1}>
              {BUDGET_CHOICES.map((b) => (
                <label key={b} className={`${chip(!customOn && budget === b)} min-h-[48px] px-2 text-[14.5px] font-semibold tabular-nums`}>
                  <input type="radio" name="budget" value={b} checked={!customOn && budget === b} onChange={() => { setBudget(b); setCustomOn(false); setErrors((e) => ({ ...e, budget: undefined })); }} className="sr-only" />
                  {budgetLabel(b)}
                </label>
              ))}
              <label className={`${chip(customOn)} min-h-[48px] px-2 text-[14px] font-medium`}>
                <input type="radio" name="budget-mode" checked={customOn} onChange={() => setCustomOn(true)} className="sr-only" />
                Custom
              </label>
            </div>
            {customOn && (
              <div className={`mt-2 max-w-[280px] ${fieldBox(false)}`}>
                <span aria-hidden className="text-[16px] text-white/55">$</span>
                <input
                  aria-label="Custom monthly budget in dollars"
                  name="budget"
                  value={custom}
                  onChange={(e) => { setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 7)); setErrors((x) => ({ ...x, budget: undefined })); }}
                  inputMode="numeric"
                  placeholder="1,500"
                  autoFocus
                  className="min-h-[48px] min-w-0 flex-1 bg-transparent text-[16px] tabular-nums text-white placeholder:text-white/40 outline-none"
                />
                <span className="text-[13px] text-white/55">a month</span>
              </div>
            )}
            <p className="mt-2 text-[13px] leading-snug text-white/60">What you&rsquo;d pay Meta for ads each month, from your own ad account — not the price of MAIRO.</p>
            {err.budget && <p className="mt-1 text-[13px] text-red-300">{err.budget}</p>}
          </fieldset>

          <button
            type="submit"
            disabled={reading}
            className="group mt-6 inline-flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4f6bff] via-[#6b5bff] to-[#a35bff] px-4 text-[15.5px] font-semibold sm:gap-2.5 sm:px-6 sm:text-[17px] text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
          >
            {reading ? "Reading your website…" : (
              <>
                <IconSparkle className="h-5 w-5" />
                Generate My Free AI Ad Plan <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
              </>
            )}
          </button>
          <ul aria-label="100% free · No credit card required · No ads launched" className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] leading-tight text-white/70">
            <li className="flex items-center gap-2"><IconShield className="h-5 w-5 shrink-0 text-emerald-300" />100% free</li>
            <li className="flex items-center gap-2"><IconCard className="h-5 w-5 shrink-0 text-sky-300" />No credit card required</li>
            <li className="flex items-center gap-2"><IconPause className="h-5 w-5 shrink-0 text-violet-300" />No ads launched</li>
          </ul>
        </form>

        <WhatHappensNext />
      </div>
    </div>
  );
}

/** Beside the form: what pressing Generate does, and what the plan contains — two short lists. */
function WhatHappensNext() {
  return (
    <aside aria-label="What happens next" className="min-w-0 rounded-[28px] border p-5 text-left sm:p-6" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)" }}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-200/90">What happens next</p>
      <div className="mt-4 flex items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-200"><IconSearch className="h-5 w-5" /></span>
        <div>
          <p className="text-[15px] font-semibold text-white">MAIRO studies your business</p>
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/65">It reads your website, finds advertising opportunities, and plans your Meta strategy and budget.</p>
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-200"><IconDoc className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-white">You get your free ad plan</p>
          <ul className="mt-1.5 space-y-1 text-[13.5px] text-white/70">
            {["Your Meta ad strategy", "Who to target", "Your budget breakdown", "Three AI ad concepts", "Website suggestions", "Your first 30 days"].map((t) => (
              <li key={t} className="flex items-center gap-2"><span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />{t}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3">
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-200"><IconRocket className="h-5 w-5" /></span>
        <div>
          <p className="text-[15px] font-semibold text-white">MAIRO can run it for you</p>
          <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/65">If you like the plan, subscribe and MAIRO builds the campaigns. Nothing launches without your approval.</p>
        </div>
      </div>
    </aside>
  );
}

function Running({ stages, headingRef, progress }: { stages: Stage[]; headingRef: RefObject<HTMLHeadingElement | null>; progress: string | null }) {
  const now = stages.find((s) => s.state === "working");
  return (
    <section aria-labelledby="plan-running" className="mx-auto max-w-[640px]">
      <p className="text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-violet-200">MAIRO is building your plan</p>
      <h1 id="plan-running" ref={headingRef} tabIndex={-1} className="mt-3 text-center text-[clamp(26px,4vw,38px)] font-semibold tracking-[-0.03em] text-white outline-none">
        {now ? `${now.label}…` : "Your plan is ready"}
      </h1>
      <ol className="mt-8 space-y-2.5 rounded-[28px] border p-4 sm:p-6" style={{ borderColor: "var(--mairo-line)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)" }}>
        {stages.map((s, i) => (
          <li key={s.label} className={`flex items-start gap-3.5 rounded-2xl px-3 py-2.5 transition-colors duration-300 ${s.state === "working" ? "bg-violet-500/[0.10]" : ""}`} aria-current={s.state === "working" ? "step" : undefined}>
            <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
              {s.state === "done" ? (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/15 text-[12px] text-emerald-300 motion-safe:animate-[mairo-pop_.25s_ease-out]">✓</span>
              ) : s.state === "working" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-300/30 border-t-violet-200 motion-reduce:animate-none" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/12 font-mono text-[10.5px] text-white/40">{i + 1}</span>
              )}
            </span>
            <div className="min-w-0">
              <p className={`text-[14.5px] font-medium ${s.state === "waiting" ? "text-white/45" : "text-white"}`}>{s.label}</p>
              {(s.state === "done" && s.detail) || (s.state === "working" && i === 0 && progress) ? (
                <p className="mt-0.5 break-words text-[12.5px] leading-snug text-white/55">{s.state === "working" ? progress : s.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      <p role="status" className="sr-only">{now ? now.label : "Your plan is ready"}</p>
      <p className="mt-4 text-center text-[12.5px] text-white/45">Each step is ticked when its work is done — nothing here is a timer.</p>
    </section>
  );
}
