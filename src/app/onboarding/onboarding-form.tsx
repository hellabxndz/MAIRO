"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  completeOnboardingAction,
  correctLearnedAction,
  learnBusinessAction,
  saveBusinessStepAction,
  saveGoalDraftAction,
} from "@/lib/actions/onboarding-actions";
import { needsSiteTracking, requiredDetailFor, MESSAGE_CHANNELS, DEFAULT_MESSAGE_CHANNEL } from "@/lib/campaigns/destination";
import { RECOMMENDED_MONTHLY, SETUP_GOALS, budgetMeaning, recommendGoal, type SetupGoal } from "@/lib/onboarding/goal";
import type { Screen } from "@/lib/onboarding/draft";
import type { LearnResult } from "@/lib/onboarding/setup";
import { BUSINESS_TYPES, UNSURE, businessTypeFrom, reachQuestion } from "@/lib/onboarding/business-types";
import type { AdDestination, MessageChannel } from "@/generated/prisma/enums";
import { ToolHandoff } from "@/components/onboarding/tool-handoff";

// Setting up, in three screens — steps 1 to 3 of ten:
//
//   1. Your business     what it does, its website, where its customers are
//   2. MAIRO learns      the Strategy Agent reads the website (a real request)
//                        and shows only what it actually found
//   3. Your goal         sales, leads or appointments, how people reach you,
//                        and a budget — each with a suggestion and the reason
//
// Every screen is saved as it goes, so closing the tab or a failed save loses
// nothing; the next visit opens where they stopped. The last screen submits
// to completeOnboardingAction with the same fields as before.

const input =
  "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-[14px] text-white placeholder-neutral-500 outline-none focus:border-white/30";
const card = "rounded-2xl border border-white/[0.07] bg-field/80 p-5 sm:p-7";
const primary = "min-h-[46px] rounded-lg bg-[image:var(--mairo-ramp)] px-6 text-[14.5px] font-medium text-white shadow-[var(--mairo-glow-key)] transition hover:brightness-110 disabled:opacity-60";
const secondary = "min-h-[46px] rounded-lg border border-white/12 px-5 text-[14px] text-white/85 hover:border-white/30 disabled:opacity-60";

// How a business wants leads to reach it. Three of the four finish somewhere
// MAIRO or Meta can already see — nothing to install on the website.
const LEAD_DESTINATIONS = [
  { key: "LEAD_FORM" as const, label: "They fill in a form", sub: "MAIRO writes the questions and hosts it for you" },
  { key: "PHONE_CALL" as const, label: "They call me", sub: "A tap-to-call button on the ad" },
  { key: "DIRECT_MESSAGE" as const, label: "They message me", sub: "The ad opens a chat with your Facebook Page" },
  { key: "WEBSITE" as const, label: "They enquire or book on my website", sub: "Your own contact or booking page" },
];
const GENERAL_DESTINATIONS = [
  { key: "WEBSITE" as const, label: "They go to my website", sub: "A shop, a booking page, anything online" },
  { key: "PHONE_CALL" as const, label: "They call me", sub: "A tap-to-call button on the ad" },
];

export type Business = { website: string; industry: string; offering: string; customerLocation: string; businessType: string; reach: string };
export type GoalDraft = {
  primaryGoal?: string;
  monthlyBudget?: number;
  destinationType?: string;
  messageChannel?: string;
  phone?: string;
  currentOffer?: string;
  targetAudience?: string;
  brandVoice?: string;
  competitors?: string;
  notes?: string;
  budgetSuggested?: boolean;
};

function Why({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{children}</p>;
}

function Field({ label, required, why, children }: { label: string; required?: boolean; why?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13.5px] font-medium text-white">
        {label} <span className="font-normal text-faint">{required ? "· needed" : "· optional"}</span>
      </span>
      <span className="mt-1.5 block">{children}</span>
      {why && <Why>{why}</Why>}
    </label>
  );
}

export function OnboardingForm({ initialScreen, business: initialBusiness, goal: initialGoal, defaultDestination, initialSuggestion }: { initialScreen: Screen; business: Business; goal: GoalDraft; defaultDestination: AdDestination | null; initialSuggestion: { goal: SetupGoal; why: string } }) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [business, setBusiness] = useState<Business>(initialBusiness);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Screen 2's result.
  const [learning, setLearning] = useState(false);
  const [learnt, setLearnt] = useState<Pick<LearnResult, "read" | "learned" | "unknown" | "pagesRead" | "note"> | null>(null);
  const [locationUnsure, setLocationUnsure] = useState(!initialBusiness.customerLocation && initialBusiness.reach === "Not sure");
  const [suggestion, setSuggestion] = useState(initialSuggestion);

  async function saveBusiness() {
    setError(null);
    setSaving(true);
    const r = await saveBusinessStepAction(business).catch(() => ({ ok: false as const, error: "MAIRO couldn't reach the server. Your answers are still on this page — try again." }));
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setBusiness((b) => ({ ...b, website: r.website ?? "" }));
    setLearnt(null);
    setScreen(r.website ? "learn" : "goal");
    // The progress bar and the team panel are drawn on the server, from the
    // records just saved.
    router.refresh();
    if (!r.website) setSuggestion(recommendGoal({ industry: business.industry, offering: business.offering }));
  }

  // Reading the website is a real request: started when screen 2 opens, and
  // shown as happening only while it is.
  const started = useRef(false);
  useEffect(() => {
    if (screen !== "learn" || started.current) return;
    started.current = true;
    setLearning(true);
    learnBusinessAction()
      .then((r) => {
        setLearnt({ read: r.read, learned: r.learned, unknown: r.unknown, pagesRead: r.pagesRead, note: r.note });
        setSuggestion(r.suggestion);
      })
      .catch(() => setLearnt({ read: false, learned: [], unknown: [], pagesRead: [], note: "MAIRO couldn't read your website just now, so your plan's website advice will be general. You can carry on." }))
      .finally(() => {
        setLearning(false);
        router.refresh();
      });
  }, [screen, router]);

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-[12px]" aria-label="Setup screens">
        {(["business", "learn", "goal"] as const).map((s, i) => (
          <li key={s} aria-current={screen === s ? "step" : undefined} className={`rounded-full border px-3 py-1 ${screen === s ? "border-violet/60 bg-violet/15 text-white" : "border-white/10 text-faint"}`}>
            {i + 1}. {s === "business" ? "Your business" : s === "learn" ? "MAIRO learns" : "Your goal"}
          </li>
        ))}
      </ol>

      {screen === "business" && (
        <section className={card} aria-labelledby="s-business">
          <h1 id="s-business" className="text-[24px] font-semibold tracking-[-0.02em] text-white">Tell MAIRO about your business</h1>
          <p className="mt-1.5 text-[14px] text-muted">A few quick questions. Only the first is needed — &ldquo;not sure&rdquo; is always a fine answer, and the more MAIRO knows, the more your free plan is about you.</p>
          <ToolHandoff
            kinds={["website"]}
            onUse={(h) => {
              if (h.kind === "website") setBusiness((b) => ({ ...b, website: h.url }));
              return "added as your website below";
            }}
          />
          <div className="mt-6 space-y-5">
            <fieldset>
              <legend className="text-[13.5px] font-medium text-white">What kind of business is it? <span className="font-normal text-faint">· optional</span></legend>
              <Why>It decides what MAIRO measures for you — leads and bookings, or orders and sales.</Why>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {[...BUSINESS_TYPES, { id: UNSURE, label: "Not sure" }].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={business.businessType === t.id}
                    onClick={() => setBusiness({ ...business, businessType: t.id, reach: business.businessType === t.id ? business.reach : "" })}
                    className={`min-h-[40px] rounded-full border px-3.5 text-[13px] transition ${business.businessType === t.id ? "border-violet/60 bg-violet/[0.1] text-white" : "border-white/10 bg-white/[0.03] text-white/80 hover:border-white/25"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="What does your business do?" required why="So your plan and ads talk about what you actually sell.">
              <input className={input} value={business.offering} maxLength={200} onChange={(e) => setBusiness({ ...business, offering: e.target.value })} placeholder="e.g. Family dentistry and teeth whitening" />
            </Field>
            <Field label="Your website" why="Your Strategy Agent reads it to learn your products, prices and what makes you different. Nothing is posted or changed.">
              <input className={input} value={business.website} inputMode="url" onChange={(e) => setBusiness({ ...business, website: e.target.value })} placeholder="yourbusiness.com — or leave empty if you don't have one" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Industry" why="Helps MAIRO suggest a sensible starting goal.">
                <input className={input} value={business.industry} maxLength={120} onChange={(e) => setBusiness({ ...business, industry: e.target.value })} placeholder="e.g. Dental practice" />
              </Field>
              <div>
                <Field label="Where are your customers?" why="Where your ads are shown. You can make it more precise later.">
                  <input className={input} value={business.customerLocation} disabled={locationUnsure} maxLength={120} onChange={(e) => setBusiness({ ...business, customerLocation: e.target.value })} placeholder="e.g. Austin, TX — or all of the US" />
                </Field>
                {/* Its own label, not inside the field's — a label inside a label names both inputs. */}
                <label className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
                  <input type="checkbox" className="accent-[#7c5cff]" checked={locationUnsure} onChange={(e) => { setLocationUnsure(e.target.checked); if (e.target.checked) setBusiness({ ...business, customerLocation: "" }); }} />
                  Not sure yet — MAIRO will assume people near you and say so on your plan
                </label>
              </div>
            </div>
            {(() => {
              const q = reachQuestion(businessTypeFrom(business.businessType)?.kind ?? null);
              if (!q) return null;
              return (
                <Field label={q.label} why="So your ads reach people you can actually serve.">
                  <select className={`${input} max-w-[320px]`} value={business.reach} onChange={(e) => setBusiness({ ...business, reach: e.target.value })}>
                    <option value="">Choose…</option>
                    {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
              );
            })()}
          </div>
          {error && <p role="alert" className="mt-5 rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className={primary} disabled={saving || (!business.offering.trim() && !business.industry.trim())} onClick={() => void saveBusiness()}>
              {saving ? "Saving…" : "Continue"}
            </button>
            <span className="text-[12.5px] text-faint">Saved as you go — you can stop and come back any time.</span>
          </div>
        </section>
      )}

      {screen === "learn" && (
        <section className={card} aria-labelledby="s-learn" aria-busy={learning}>
          <h1 id="s-learn" className="text-[24px] font-semibold tracking-[-0.02em] text-white">MAIRO learns about your business</h1>
          {learning ? (
            <p role="status" className="mt-3 text-[14px] text-white/85">
              Your Strategy Agent is reading {business.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}. This usually takes 10 to 30 seconds.
            </p>
          ) : learnt?.read ? (
            <>
              <p className="mt-2 text-[14px] text-muted">Here&rsquo;s what your Strategy Agent found on your website. Confirm it, fix it or remove it — your word always wins over the website.</p>
              {learnt.pagesRead.length > 0 && (
                <p className="mt-2 text-[12.5px] text-faint">
                  Read: {learnt.pagesRead.slice(0, 4).map((u, i) => (
                    <span key={u}>{i > 0 && ", "}<a href={u} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 hover:text-white">{u.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a></span>
                  ))}
                </p>
              )}
              {learnt.learned.length ? (
                <dl className="mt-5 space-y-3">
                  {learnt.learned.map((l) => <LearnedFact key={l.field} item={l} />)}
                </dl>
              ) : (
                <p className="mt-4 text-[14px] text-white/85">It read your website but didn&rsquo;t find much to go on, so your plan will lean on your answers.</p>
              )}
              {learnt.unknown.length > 0 && (
                <div className="mt-5 rounded-xl border border-amber-400/25 bg-amber-400/[0.05] px-4 py-3">
                  <p className="text-[13.5px] font-medium text-white">Not on your website</p>
                  <ul className="mt-1.5 space-y-1 text-[13px] text-white/80">
                    {learnt.unknown.map((u) => <li key={u.field}><span className="text-white">{u.label}:</span> {u.ask}</li>)}
                  </ul>
                </div>
              )}
            </>
          ) : learnt ? (
            <p className="mt-3 rounded-lg bg-white/[0.04] px-4 py-3 text-[14px] text-white/85">{learnt.note ?? "MAIRO couldn't read your website, so your plan's website advice will be general."} Nothing is lost — your plan will use your answers.</p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className={secondary} disabled={learning} onClick={() => setScreen("business")}>← Back</button>
            <button type="button" className={primary} disabled={learning} onClick={() => setScreen("goal")}>Continue</button>
          </div>
        </section>
      )}

      {screen === "goal" && <GoalScreen business={business} initial={initialGoal} suggestion={suggestion} defaultDestination={defaultDestination} onBack={() => setScreen(business.website ? "learn" : "business")} />}
    </div>
  );
}

function GoalScreen({ business, initial, suggestion, defaultDestination, onBack }: { business: Business; initial: GoalDraft; suggestion: { goal: SetupGoal; why: string }; defaultDestination: AdDestination | null; onBack: () => void }) {
  const [state, formAction, pending] = useActionState(completeOnboardingAction, undefined);
  const [goal, setGoal] = useState<GoalDraft>(() => ({
    ...initial,
    primaryGoal: initial.primaryGoal ?? suggestion.goal,
    monthlyBudget: initial.monthlyBudget ?? RECOMMENDED_MONTHLY,
    destinationType: initial.destinationType ?? defaultDestination ?? undefined,
    messageChannel: initial.messageChannel ?? DEFAULT_MESSAGE_CHANNEL,
  }));
  const [website, setWebsite] = useState(business.website);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const gettingLeads = goal.primaryGoal === "LEADS";
  const options = gettingLeads ? LEAD_DESTINATIONS : GENERAL_DESTINATIONS;
  // A suggested way to be reached: a form needs nothing installed, a shop needs its website.
  const suggestedDestination: AdDestination = gettingLeads ? (business.website ? "WEBSITE" : "LEAD_FORM") : "WEBSITE";
  const chosen = (options.some((o) => o.key === goal.destinationType) ? goal.destinationType : options.find((o) => o.key === suggestedDestination)?.key ?? options[0].key) as AdDestination;
  const needs = requiredDetailFor(chosen);
  const budget = budgetMeaning(goal.monthlyBudget ?? RECOMMENDED_MONTHLY);

  // Saved a second after they stop typing, so leaving loses nothing.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaved("saving");
    const t = setTimeout(() => {
      saveGoalDraftAction({ ...goal, destinationType: chosen })
        .then((r) => setSaved(r.ok ? "saved" : "failed"))
        .catch(() => setSaved("failed"));
    }, 900);
    return () => clearTimeout(t);
  }, [goal, chosen]);

  const set = (patch: Partial<GoalDraft>) => setGoal((g) => ({ ...g, ...patch }));
  // "More about your business" opens itself when a tool result lands in it, so nothing is filled in out of sight.
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <form action={formAction} className={card} aria-labelledby="s-goal">
      <h1 id="s-goal" className="text-[24px] font-semibold tracking-[-0.02em] text-white">Choose your goal</h1>
      <p className="mt-1.5 text-[14px] text-muted">MAIRO has filled in suggestions — each says why. Change anything; nothing is built or spent until you approve your campaign.</p>
      <ToolHandoff
        kinds={["budget", "offer", "hooks", "note"]}
        onUse={(h) => {
          const append = (text: string) => setGoal((g) => ({ ...g, notes: [g.notes?.trim(), text].filter(Boolean).join("\n\n").slice(0, 2000) }));
          if (h.kind === "budget") {
            set({ monthlyBudget: Math.round(h.monthlyBudget), budgetSuggested: false });
            return "set as your monthly budget";
          }
          if (h.kind === "offer") {
            set({ currentOffer: h.offer.slice(0, 200) });
            return "set as your current offer";
          }
          if (h.kind === "hooks") {
            append(`Hooks I'd like to test:\n${h.hooks.map((x) => `- ${x}`).join("\n")}`);
            setMoreOpen(true);
            return "added to “Anything else MAIRO should know?”";
          }
          if (h.kind === "note") {
            append(`${h.label}:\n${h.text}`);
            setMoreOpen(true);
            return "added to “Anything else MAIRO should know?”";
          }
          return "";
        }}
      />

      <fieldset className="mt-6">
        <legend className="text-[13.5px] font-medium text-white">What do you want more of? <span className="font-normal text-faint">· needed</span></legend>
        <Why>It decides what your ads ask people to do.</Why>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {SETUP_GOALS.map((g) => (
            <label key={g.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 has-[:checked]:border-violet/60 has-[:checked]:bg-violet/[0.08]">
              <input type="radio" name="primaryGoal" value={g.value} checked={goal.primaryGoal === g.value} onChange={() => set({ primaryGoal: g.value, destinationType: undefined })} className="mt-1 accent-[#7c5cff]" />
              <span>
                <span className="block text-[14px] text-white">
                  {g.label}
                  {g.value === suggestion.goal && <span className="ml-2 rounded-full bg-violet/20 px-2 py-0.5 text-[11px] text-violet-bright">Suggested</span>}
                </span>
                <span className="block text-[12.5px] text-muted">{g.sub}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] text-muted">Why MAIRO suggests “{SETUP_GOALS.find((g) => g.value === suggestion.goal)?.label}”: {suggestion.why}</p>
      </fieldset>

      <fieldset className="mt-7">
        <legend className="text-[13.5px] font-medium text-white">
          {gettingLeads ? "How should people reach you?" : "When someone taps your ad, what should happen?"} <span className="font-normal text-faint">· needed</span>
        </legend>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {options.map((d) => (
            <button key={d.key} type="button" aria-pressed={chosen === d.key} onClick={() => set({ destinationType: d.key })} className={`rounded-xl border p-4 text-left transition ${chosen === d.key ? "border-violet/60 bg-violet/[0.08]" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}>
              <p className="text-[14px] text-white">
                {d.label}
                {d.key === suggestedDestination && <span className="ml-2 rounded-full bg-violet/20 px-2 py-0.5 text-[11px] text-violet-bright">Suggested</span>}
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">{d.sub}</p>
            </button>
          ))}
        </div>
        <input type="hidden" name="destinationType" value={chosen} />
        <p className={`mt-3 rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed ${needsSiteTracking(chosen) ? "border-amber-400/25 bg-amber-400/[0.05] text-amber-200" : "border-emerald-400/25 bg-emerald-400/[0.05] text-emerald-200"}`}>
          {needsSiteTracking(chosen)
            ? "To count what happens on your website, MAIRO will need a small piece of tracking code there. It walks you through that later — or does it for you with Google Tag Manager. Your ads can still run without it."
            : "Nothing to install. MAIRO and Meta can count these on their own."}
        </p>
        {needs === "phone" && (
          <div className="mt-4">
            <Field label="Phone number" required why="The number your ads ring. Nobody sees it until they tap the button.">
              <input name="phone" className={input} inputMode="tel" value={goal.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} placeholder="(555) 123-4567" />
            </Field>
          </div>
        )}
        {needs === "website" && !business.website && (
          <div className="mt-4">
            <Field label="Website" required why="Where people land when they tap your ad.">
              <input className={input} value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourbusiness.com" />
            </Field>
          </div>
        )}
        {needs === "channel" && (
          <div className="mt-4">
            <p className="text-[13.5px] font-medium text-white">Which inbox should it open?</p>
            <input type="hidden" name="messageChannel" value={goal.messageChannel ?? DEFAULT_MESSAGE_CHANNEL} />
            <div className="mt-2 grid gap-2.5 sm:grid-cols-3">
              {MESSAGE_CHANNELS.map((c) => (
                <button key={c.key} type="button" aria-pressed={goal.messageChannel === c.key} onClick={() => set({ messageChannel: c.key as MessageChannel })} className={`rounded-xl border p-3 text-left transition ${goal.messageChannel === c.key ? "border-violet/60 bg-violet/[0.08]" : "border-white/10 bg-white/[0.03] hover:border-white/25"}`}>
                  <p className="text-[13.5px] text-white">{c.label}</p>
                  <p className="mt-0.5 text-[12px] text-muted">{c.sub}</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      <div className="mt-7">
        <Field label="Monthly ad budget (USD)" required why={<>{budget.text} Paid to Meta, not to MAIRO — and you approve the exact amount before anything is spent.</>}>
          <input name="monthlyBudget" type="number" min={100} step={50} required className={`${input} max-w-[220px]`} value={goal.monthlyBudget ?? ""} onChange={(e) => set({ monthlyBudget: e.target.value === "" ? undefined : Number(e.target.value), budgetSuggested: false })} />
        </Field>
        <input type="hidden" name="budgetSuggested" value={goal.budgetSuggested ? "1" : "0"} />
        {goal.budgetSuggested ? (
          <p className="mt-1 text-[12.5px] text-muted">Using MAIRO&rsquo;s starting suggestion. Your plan marks it as a suggestion, and you can change it any time before you approve.</p>
        ) : (
          <button type="button" className="mt-1 text-[12.5px] text-violet-bright hover:text-white" onClick={() => set({ monthlyBudget: RECOMMENDED_MONTHLY, budgetSuggested: true })}>
            I&rsquo;m not sure — start with MAIRO&rsquo;s suggestion (${RECOMMENDED_MONTHLY.toLocaleString("en-US")} a month)
          </button>
        )}
      </div>

      <div className="mt-6">
        <Field label="Any offer right now?" why="Only one you really run — ads can't promise one you don't.">
          <input name="currentOffer" className={input} maxLength={200} value={goal.currentOffer ?? ""} onChange={(e) => set({ currentOffer: e.target.value })} placeholder="e.g. 20% off your first visit" />
        </Field>
      </div>

      <details open={moreOpen} onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)} className="mt-6 rounded-xl border border-white/[0.07] p-4">
        <summary className="cursor-pointer text-[13.5px] text-white">Tell MAIRO more <span className="text-faint">· optional</span></summary>
        <div className="mt-4 space-y-4">
          <Field label="Who are you trying to reach?" why="MAIRO uses it to choose the audience. Leave it empty and it works it out from your goal.">
            <textarea name="targetAudience" rows={2} className={input} value={goal.targetAudience ?? ""} onChange={(e) => set({ targetAudience: e.target.value })} placeholder="e.g. Homeowners aged 30–55 within 20 miles of Austin, TX" />
          </Field>
          <Field label="Brand voice">
            <textarea name="brandVoice" rows={2} className={input} value={goal.brandVoice ?? ""} onChange={(e) => set({ brandVoice: e.target.value })} placeholder="e.g. Friendly and casual, no corporate jargon" />
          </Field>
          <Field label="Competitors">
            <input name="competitors" className={input} value={goal.competitors ?? ""} onChange={(e) => set({ competitors: e.target.value })} placeholder="Comma-separated" />
          </Field>
          <Field label="Anything else MAIRO should know?">
            <textarea name="notes" rows={3} className={input} value={goal.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </details>

      {/* From screen 1. */}
      <input type="hidden" name="website" value={business.website || website} />
      <input type="hidden" name="industry" value={business.industry} />
      <input type="hidden" name="offering" value={business.offering} />
      <input type="hidden" name="customerLocation" value={business.customerLocation} />
      <input type="hidden" name="serviceReach" value={business.reach} />

      {state?.error && <p role="alert" className="mt-5 rounded-lg bg-alert/10 px-3 py-2 text-[13px] text-alert">{state.error} Your answers are saved.</p>}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button type="button" className={secondary} onClick={onBack} disabled={pending}>← Back</button>
        <button type="submit" className={primary} disabled={pending}>{pending ? "Saving…" : "Build my free plan"}</button>
        <span className="text-[12.5px] text-faint" aria-live="polite">
          {saved === "saving" ? "Saving…" : saved === "saved" ? "Saved — you can close this page and come back." : saved === "failed" ? "Couldn't save just now — your answers are still here." : "Saved as you go."}
        </span>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">Next, your Strategy Agent writes your free plan. It&rsquo;s free and builds nothing on Meta.</p>
    </form>
  );
}

/** One fact MAIRO read, with Confirm, Fix and Remove — saved to Business Brain as the owner's word. */
function LearnedFact({ item }: { item: LearnResult["learned"][number] }) {
  const [value, setValue] = useState(item.value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.value);
  const [state, setState] = useState<"idle" | "saving" | "confirmed" | "removed" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function run(op: "set" | "remove" | "confirm") {
    setState("saving");
    setError(null);
    const r = await correctLearnedAction({ field: item.field, op, value: op === "set" ? draft : undefined }).catch(() => ({ ok: false as const, error: "MAIRO couldn't save that just now." }));
    if (!r.ok) {
      setState("error");
      setError(r.error);
      return;
    }
    if (op === "set") {
      setValue(draft);
      setEditing(false);
    }
    setState(op === "remove" ? "removed" : "confirmed");
  }

  if (state === "removed") {
    return (
      <div className="rounded-xl border border-white/[0.07] px-4 py-3 text-[13px] text-muted">
        <dt className="text-[12px] text-faint">{item.label}</dt>
        <dd className="mt-0.5">Removed. MAIRO won&rsquo;t use it.</dd>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/[0.07] px-4 py-3">
      <dt className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-faint">
        <span>{item.label} · <span className="text-white/60">{state === "confirmed" ? "confirmed by you" : "from your website"}</span></span>
        {item.editable && !editing && state !== "saving" && (
          <span className="flex gap-3">
            {state !== "confirmed" && <button type="button" className="text-violet-bright hover:text-white" onClick={() => void run("confirm")}>Confirm</button>}
            <button type="button" className="text-violet-bright hover:text-white" onClick={() => setEditing(true)}>Fix</button>
            <button type="button" className="text-violet-bright hover:text-white" onClick={() => void run("remove")}>Remove</button>
          </span>
        )}
        {!item.editable && <a href="/dashboard/settings/business-brain" className="text-violet-bright hover:text-white">Edit later in Business Brain</a>}
      </dt>
      {editing ? (
        <dd className="mt-2 flex flex-wrap gap-2">
          <input aria-label={`Correct: ${item.label}`} className={`${input} min-w-0 flex-1`} value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} />
          <button type="button" className={secondary} onClick={() => void run("set")} disabled={state === "saving"}>Save</button>
          <button type="button" className="text-[13px] text-muted hover:text-white" onClick={() => { setEditing(false); setDraft(value); }}>Cancel</button>
        </dd>
      ) : (
        <dd className="mt-0.5 text-[14px] text-white">{value}</dd>
      )}
      {error && <p role="alert" className="mt-1 text-[12.5px] text-alert">{error}</p>}
    </div>
  );
}
