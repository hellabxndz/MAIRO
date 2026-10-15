"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWebsiteScan } from "@/components/tools/use-website-scan";
import { handOffPlan } from "@/components/plan-generator/plan-generator";
import { GoalIcon, IconCard, IconLink, IconPause, IconShield, IconSparkle, IconStore, IconTag } from "@/components/plan-generator/icons";
import { factsFromScan, type PreviewGoal } from "@/lib/preview/build";
import type { GeneratorAnswers } from "@/lib/preview/answers";
import { BUDGET_CHOICES, BUDGET_MAX, BUDGET_MIN, GOAL_OPTIONS, budgetLabel } from "@/lib/preview/strategy";
import type { ScanResult } from "@/lib/website/scan";
import { heroVariant, track } from "@/lib/analytics/track";

// The homepage's free plan, as a short conversation: one answer first — the
// website, the Instagram username or, with neither, a sentence about the
// business — then MAIRO says what it read and asks the three things it still
// needs (what they sell, the goal, the monthly Meta budget). The plan itself
// is made on /preview, handed over through this tab's session storage (never
// the address bar); without JavaScript the form goes there as a plain request
// and the full generator takes over.
//
// Nothing is guessed: what the website or profile said is shown for the
// visitor to check, a reading that fails says so, and the visitor's own
// words are always enough to continue.

type Source = "website" | "instagram" | "describe";
type Read = { by: Source; label: string; ok: boolean; message: string | null; name: string; sells: string; goal: PreviewGoal | null; scan: ScanResult | null; website: string | null };

const SOURCES: { key: Source; label: string }[] = [
  { key: "website", label: "Website" },
  { key: "instagram", label: "Instagram" },
  { key: "describe", label: "No website" },
];

const domainOf = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

function normalize(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, "");
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || u.hostname.endsWith(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

const readOk = (r: ScanResult | null) => Boolean(r && (r.status === "OK" || r.status === "PARTIAL") && !r.socialInstead);

type InstagramReply = { status: "read"; profile: { handle: string; name: string | null; bio: string | null } } | { status: string; message?: string; handle?: string };

export function HeroStarter() {
  const router = useRouter();
  const { state: scanState, run: runScan } = useWebsiteScan();
  const formRef = useRef<HTMLFormElement>(null);

  const [source, setSource] = useState<Source>("website");
  const [first, setFirst] = useState("");
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState<Read | null>(null);
  const [sells, setSells] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<PreviewGoal | "">("");
  const [budget, setBudget] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [customOn, setCustomOn] = useState(false);
  const [tried, setTried] = useState(false);
  const [firstError, setFirstError] = useState<string | null>(null);

  const monthly = customOn ? Math.round(Number(custom.replace(/[^0-9]/g, ""))) || null : budget;
  const budgetOk = Boolean(monthly && monthly >= BUDGET_MIN && monthly <= BUDGET_MAX);
  const needsName = !read?.name;

  const focus = (field: string) => formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`)?.focus();

  /** Step one: read what the visitor pointed to, then ask the rest. */
  const start = async () => {
    setFirstError(null);
    const value = first.trim();
    if (source === "website") {
      const url = normalize(value);
      if (!url) {
        setFirstError(value ? "Enter a web address like yourbusiness.com." : "Add your website — or choose Instagram or No website.");
        focus("first");
        return;
      }
      track({ name: "preview_start", props: { source: "url", variant: heroVariant() } });
      setBusy(true);
      const result = await runScan({ url });
      setBusy(false);
      const ok = readOk(result);
      const f = ok && result ? factsFromScan(result) : null;
      // No result: the hook holds the server's reason (a daily limit, say), shown below.
      const message = !result
        ? null
        : result.socialInstead
          ? `That's a ${result.socialInstead.network} profile, not a website.`
          : ok
            ? null
            : (result.error ?? "MAIRO couldn't read that website.");
      track({ name: "preview_result", props: { outcome: ok ? "facts" : result?.status === "BLOCKED" ? "blocked" : "failed", variant: heroVariant() } });
      next({ by: "website", label: domainOf(url), ok, message, name: f?.name ?? "", sells: f?.offering ?? "", goal: f?.goal || null, scan: ok ? result : null, website: url });
      return;
    }
    if (source === "instagram") {
      if (!value) {
        setFirstError("Enter your Instagram username, like @yourbusiness.");
        focus("first");
        return;
      }
      track({ name: "preview_start", props: { source: "manual", variant: heroVariant() } });
      setBusy(true);
      let reply: InstagramReply | null = null;
      try {
        const res = await fetch("/api/tools/instagram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: value }) });
        reply = (await res.json()) as InstagramReply;
      } catch {
        reply = null;
      }
      setBusy(false);
      if (reply?.status === "invalid") {
        setFirstError(("message" in reply && reply.message) || "That doesn't look like an Instagram username.");
        focus("first");
        return;
      }
      const handle = `@${value.replace(/^@+/, "").replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, "").replace(/\/.*$/, "")}`;
      if (reply?.status === "read" && "profile" in reply) {
        const p = reply.profile;
        next({ by: "instagram", label: `@${p.handle}`, ok: true, message: null, name: p.name ?? "", sells: (p.bio ?? "").slice(0, 400), goal: null, scan: null, website: null });
      } else {
        next({ by: "instagram", label: handle, ok: false, message: (reply && "message" in reply && reply.message) || "MAIRO couldn't reach Instagram just now.", name: "", sells: "", goal: null, scan: null, website: null });
      }
      return;
    }
    if (value.length < 3) {
      setFirstError("Tell MAIRO what your business does, in a few words.");
      focus("first");
      return;
    }
    track({ name: "preview_start", props: { source: "manual", variant: heroVariant() } });
    next({ by: "describe", label: "Your description", ok: true, message: null, name: "", sells: value.slice(0, 400), goal: null, scan: null, website: null });
  };

  const next = (r: Read) => {
    setRead(r);
    setSells(r.sells);
    setName("");
    if (r.goal) setGoal(r.goal);
    setTried(false);
    // The first question MAIRO still needs, so a keyboard visitor carries on where they are.
    requestAnimationFrame(() => focus(r.sells ? (r.name ? "goal" : "name") : "sells"));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!read) {
      await start();
      return;
    }
    setTried(true);
    const missing = sells.trim().length < 3 ? "sells" : needsName && !name.trim() ? "name" : !goal ? "goal" : !budgetOk ? "budget" : null;
    if (missing) {
      focus(missing);
      return;
    }
    // A name the website gave comes from its reading; one from a profile, or typed, is the visitor's.
    const a: GeneratorAnswers = { website: read.website, sells: sells.trim(), name: read.by === "website" && read.name ? "" : read.name || name.trim(), goal: goal as PreviewGoal, monthly: monthly! };
    track({ name: "hero_cta", props: { cta: "free_plan", variant: heroVariant() } });
    if (handOffPlan(a, read.scan)) {
      router.push("/preview?generate=1");
      return;
    }
    // Storage blocked: the answers go as a plain request, and /preview makes the plan from them.
    formRef.current?.submit();
  };

  const reading = busy || scanState.phase === "running";
  const progress = scanState.phase === "running" ? (scanState.progress?.label ?? "Opening your website…") : source === "instagram" ? "Opening the public profile…" : null;

  const chip = (on: boolean) =>
    `flex cursor-pointer items-center justify-center rounded-xl border transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-300/60 ${on ? "border-violet-400/80 bg-violet-500/[0.16] text-white" : "border-white/[0.12] bg-white/[0.025] text-white/78 hover:border-white/30 hover:text-white"}`;
  const box = (bad: boolean) =>
    `flex items-center gap-3 rounded-2xl border bg-[#060912]/80 px-4 transition focus-within:border-cyan-300/60 focus-within:ring-2 focus-within:ring-cyan-300/15 ${bad ? "border-red-400/55" : "border-white/[0.13]"}`;

  const cta = (
    <>
      <IconSparkle className="h-[18px] w-[18px]" />
      Build My Free AI Ad Plan <span aria-hidden className="transition group-hover:translate-x-0.5">→</span>
    </>
  );

  return (
    <form
      ref={formRef}
      action="/preview"
      method="get"
      onSubmit={(e) => void submit(e)}
      noValidate
      aria-label="Build your free AI ad plan"
      className="relative rounded-[26px] border p-3.5 text-left sm:p-5"
      style={{ borderColor: "rgba(150,170,210,0.2)", backgroundImage: "var(--mairo-glass)", boxShadow: "var(--mairo-glow-soft)" }}
    >
      <input type="hidden" name="generate" value="1" />
      <div aria-hidden className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      {!read ? (
        <>
          <div role="group" aria-label="Start from" className="flex gap-1 rounded-xl bg-white/[0.04] p-1">
            {SOURCES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={source === s.key}
                onClick={() => {
                  setSource(s.key);
                  setFirst("");
                  setFirstError(null);
                  requestAnimationFrame(() => focus("first"));
                }}
                className={`min-h-[38px] flex-1 rounded-lg px-2 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 sm:text-[13.5px] ${source === s.key ? "bg-white/[0.10] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" : "text-white/60 hover:text-white"}`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <label htmlFor="hero-first" className="mt-3.5 block text-[14.5px] font-semibold text-white">
            {source === "website" ? "Your website" : source === "instagram" ? "Your Instagram username" : "What does your business do?"}
          </label>
          <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
            <div className={`min-w-0 flex-1 ${box(Boolean(firstError))}`}>
              {source === "describe" ? <IconStore className="h-5 w-5 shrink-0 text-white/45" /> : source === "instagram" ? <span aria-hidden className="w-5 shrink-0 text-center text-[17px] text-white/45">@</span> : <IconLink className="h-5 w-5 shrink-0 text-white/45" />}
              <input
                id="hero-first"
                data-field="first"
                name={source === "website" ? "website" : source === "describe" ? "sells" : undefined}
                value={first}
                onChange={(e) => {
                  setFirst(e.target.value);
                  setFirstError(null);
                }}
                inputMode={source === "website" ? "url" : "text"}
                autoComplete={source === "website" ? "url" : "off"}
                autoCapitalize={source === "describe" ? "sentences" : "none"}
                spellCheck={source === "describe"}
                maxLength={source === "describe" ? 400 : 200}
                placeholder={source === "website" ? "yourbusiness.com" : source === "instagram" ? "yourbusiness" : "We sell handmade mugs online"}
                aria-invalid={Boolean(firstError)}
                aria-describedby="hero-first-note"
                disabled={reading}
                className="min-h-[54px] min-w-0 flex-1 mairo-bare bg-transparent text-[16px] text-white outline-none placeholder:text-white/35 disabled:opacity-70"
              />
              {reading && <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-cyan-200/25 border-t-cyan-200 motion-reduce:animate-none" />}
            </div>
            <button
              type="submit"
              disabled={reading}
              className="group inline-flex min-h-[56px] shrink-0 items-center justify-center gap-2 rounded-2xl bg-[image:var(--mairo-ramp)] px-5 text-[15.5px] font-semibold text-white shadow-[0_14px_40px_-14px_rgba(47,107,255,0.9)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-75 sm:px-6"
            >
              {reading ? (source === "website" ? "Reading your website…" : "Opening your profile…") : cta}
            </button>
          </div>
          <p id="hero-first-note" role="status" className="mt-2 min-h-[18px] text-[12.5px] leading-snug">
            {firstError ? (
              <span className="text-red-300">{firstError}</span>
            ) : reading ? (
              <span className="text-white/70">{progress}</span>
            ) : (
              <span className="text-white/50">
                {source === "website"
                  ? "MAIRO reads your public pages only."
                  : source === "instagram"
                    ? "Only what Instagram shows anyone signed out: the name and bio. No posts, no insights."
                    : "A sentence is enough — MAIRO asks the rest."}
              </span>
            )}
          </p>
        </>
      ) : (
        <>
          {/* What MAIRO read, in its own words — and a way back. */}
          <div className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
            <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] ${read.ok ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-300/15 text-amber-200"}`}>{read.ok ? "✓" : "!"}</span>
            <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-white/80" role="status">
              {read.by === "describe" ? (
                <>Thanks — that&rsquo;s enough to start. Three quick answers and your plan is ready.</>
              ) : read.ok ? (
                <>
                  MAIRO read <span className="font-semibold text-white">{read.label}</span>
                  {read.by === "website" && read.scan ? ` — ${read.scan.pages.length} public page${read.scan.pages.length === 1 ? "" : "s"}` : ""}
                  {read.name ? <> and found <span className="font-semibold text-white">{read.name}</span></> : null}. Check what it understood.
                </>
              ) : (
                <>
                  {read.message ?? (scanState.phase === "error" ? scanState.message : "MAIRO couldn't reach your website just now.")} No problem — your own words are enough.
                </>
              )}
            </p>
            <button type="button" onClick={() => { setRead(null); setFirst(""); requestAnimationFrame(() => focus("first")); }} className="shrink-0 text-[12.5px] text-cyan-200/90 underline-offset-4 hover:text-white hover:underline">
              Change
            </button>
          </div>
          {read.website && <input type="hidden" name="website" value={read.website} />}

          {needsName && (
            <div className="mt-3.5">
              <label htmlFor="hero-name" className="text-[14.5px] font-semibold text-white">What&rsquo;s the business called?</label>
              <div className={`mt-1.5 ${box(tried && !name.trim())}`}>
                <IconStore className="h-5 w-5 shrink-0 text-white/45" />
                <input id="hero-name" data-field="name" name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" maxLength={80} placeholder="As your customers know it" aria-invalid={tried && !name.trim()} className="min-h-[50px] min-w-0 flex-1 mairo-bare bg-transparent text-[16px] text-white outline-none placeholder:text-white/35" />
              </div>
            </div>
          )}

          <div className="mt-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="hero-sells" className="text-[14.5px] font-semibold text-white">{read.by === "describe" ? "What you sell" : "Is this what you sell?"}</label>
              {read.ok && read.by !== "describe" && read.sells && sells === read.sells && <span className="rounded-full bg-emerald-400/12 px-2.5 py-0.5 text-[11.5px] font-medium text-emerald-300">From {read.by === "website" ? "your website" : "your bio"} — check it</span>}
            </div>
            <div className={`mt-1.5 !items-start ${box(tried && sells.trim().length < 3)}`}>
              <IconTag className="mt-[14px] h-5 w-5 shrink-0 text-white/45" />
              <textarea id="hero-sells" data-field="sells" name="sells" value={sells} onChange={(e) => setSells(e.target.value)} rows={2} maxLength={400} placeholder="Tell MAIRO what your business sells or offers…" aria-invalid={tried && sells.trim().length < 3} className="block min-h-[50px] w-full min-w-0 flex-1 resize-none mairo-bare bg-transparent py-3 text-[16px] leading-relaxed text-white outline-none placeholder:text-white/35" />
            </div>
          </div>

          <fieldset className="mt-3.5">
            <legend className="text-[14.5px] font-semibold text-white">What should your ads do?</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-5" data-field="goal" tabIndex={-1}>
              {GOAL_OPTIONS.map((g, i) => (
                <label key={g.value} className={`${chip(goal === g.value)} min-h-[46px] !justify-start gap-2 px-2.5 text-left sm:min-h-[70px] sm:flex-col sm:!justify-center sm:gap-1.5 sm:text-center ${i === GOAL_OPTIONS.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}>
                  <input type="radio" name="goal" value={g.value} checked={goal === g.value} onChange={() => setGoal(g.value)} className="sr-only" />
                  <GoalIcon goal={g.value} className={`h-5 w-5 shrink-0 ${goal === g.value ? "text-cyan-200" : "text-white/55"}`} />
                  <span className="text-[12.5px] font-medium leading-tight">{g.label}</span>
                </label>
              ))}
            </div>
            {tried && !goal && <p className="mt-1 text-[12.5px] text-red-300">Choose the goal for your ads.</p>}
          </fieldset>

          <fieldset className="mt-3.5">
            <legend className="text-[14.5px] font-semibold text-white">Monthly Meta ad budget</legend>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6" data-field="budget" tabIndex={-1}>
              {BUDGET_CHOICES.map((b) => (
                <label key={b} className={`${chip(!customOn && budget === b)} min-h-[44px] px-1 text-[14px] font-semibold tabular-nums`}>
                  <input type="radio" name="budget" value={b} checked={!customOn && budget === b} onChange={() => { setBudget(b); setCustomOn(false); }} className="sr-only" />
                  {budgetLabel(b)}
                </label>
              ))}
              <label className={`${chip(customOn)} min-h-[44px] px-1 text-[13.5px] font-medium`}>
                <input type="radio" name="budget-mode" checked={customOn} onChange={() => setCustomOn(true)} className="sr-only" />
                Other
              </label>
            </div>
            {customOn && (
              <div className={`mt-1.5 max-w-[260px] ${box(tried && !budgetOk)}`}>
                <span aria-hidden className="text-[16px] text-white/50">$</span>
                <input aria-label="Monthly budget in dollars" name="budget" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 7))} inputMode="numeric" placeholder="1500" autoFocus className="min-h-[46px] min-w-0 flex-1 mairo-bare bg-transparent text-[16px] tabular-nums text-white outline-none placeholder:text-white/35" />
                <span className="text-[12.5px] text-white/50">a month</span>
              </div>
            )}
            <p className={`mt-1.5 text-[12.5px] leading-snug ${tried && !budgetOk ? "text-red-300" : "text-white/52"}`}>
              {tried && !budgetOk && customOn ? `Enter an amount between $${BUDGET_MIN} and $${BUDGET_MAX.toLocaleString("en-US")}. ` : tried && !budgetOk ? "Choose a monthly budget. " : ""}
              What you&rsquo;d pay Meta for ads from your own account — not the price of MAIRO.
            </p>
          </fieldset>

          <button type="submit" className="group mt-4 inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[image:var(--mairo-ramp)] px-5 text-[15.5px] font-semibold text-white shadow-[0_14px_40px_-14px_rgba(47,107,255,0.9)] transition hover:brightness-110">
            {cta}
          </button>
        </>
      )}

      <ul aria-label="100% free, no credit card, no ads launched" className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12.5px] text-white/62">
        <li className="flex items-center gap-1.5"><IconShield className="h-4 w-4 text-emerald-300/90" />100% Free</li>
        <li aria-hidden className="hidden text-white/25 sm:block">·</li>
        <li className="flex items-center gap-1.5"><IconCard className="h-4 w-4 text-cyan-300/90" />No Credit Card</li>
        <li aria-hidden className="hidden text-white/25 sm:block">·</li>
        <li className="flex items-center gap-1.5"><IconPause className="h-4 w-4 text-violet-300" />No Ads Launched</li>
      </ul>
    </form>
  );
}
