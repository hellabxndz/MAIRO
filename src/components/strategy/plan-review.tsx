"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approvePlanNowAction,
  askMairoAction,
  editPlanAction,
  getStartedAction,
  restoreVersionAction,
  undoChangeAction,
  acceptSuggestionAction,
  type PlanActionResult,
} from "@/lib/actions/strategy-actions";
import {
  AGE_MAX,
  CAMPAIGN_TYPES,
  GOAL_LABEL,
  PLAN_GOALS,
  PLATFORMS,
  PLATFORM_LABEL,
  SECTION_LABEL,
  agesText,
  campaignTypeInfo,
  platformsText,
  usd,
  type ManualEdit,
  type PlanChange,
  type SectionKey,
  type StrategyContent,
  type Suggestion,
} from "@/lib/strategy/plan-logic";
import type { RevisionView } from "@/lib/strategy/store";
import { FacebookMark, InstagramMark } from "@/components/mairo/marks";

// The free plan's review screen: every section of the plan, the Edit buttons,
// "Ask Mairo" for changes in plain words, a lightweight version history, and
// the approval that unlocks "Get Started".

type Status = "DRAFT" | "REVISING" | "APPROVED";

const EXAMPLES = [
  "Change my budget to $35/day",
  "Only run on Instagram",
  "Target people in Miami aged 25–40",
  "Focus on our teeth whitening offer",
  "Make the hooks more playful",
  "Why did you pick this audience?",
];

const card = "rounded-2xl border border-white/[0.07] bg-[#0b1122]/80";
const input = "h-11 w-full rounded-lg border border-white/10 bg-[#0c1326] px-3 text-[14px] text-white outline-none placeholder:text-faint focus:border-violet/60";
const primary = "min-h-[44px] rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white transition hover:brightness-110 disabled:opacity-60";
const secondary = "min-h-[44px] rounded-lg border border-white/12 px-4 text-[13.5px] text-white/85 transition hover:border-white/30 disabled:opacity-60";

type Outcome =
  | { kind: "changed"; changes: PlanChange[]; version: number; request: string | null }
  | { kind: "answer"; text: string }
  | null;

export function PlanReview(props: {
  plan: StrategyContent;
  version: number;
  status: Status;
  revisions: RevisionView[];
  businessName: string;
  purchaseTracking: boolean;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(props.plan);
  const [version, setVersion] = useState(props.version);
  const [status, setStatus] = useState<Status>(props.status);
  const [highlight, setHighlight] = useState<Set<SectionKey>>(new Set());
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [pending, start] = useTransition();
  const askRef = useRef<HTMLTextAreaElement>(null);
  const [request, setRequest] = useState("");
  const [example, setExample] = useState(0);

  // Server state wins after a refresh (another tab, or the history list).
  const [seen, setSeen] = useState(props.version);
  if (props.version !== seen) {
    setSeen(props.version);
    setPlan(props.plan);
    setVersion(props.version);
    setStatus(props.status);
  }

  useEffect(() => {
    const t = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (highlight.size === 0) return;
    const t = setTimeout(() => setHighlight(new Set()), 4000);
    return () => clearTimeout(t);
  }, [highlight]);

  function apply(r: PlanActionResult, req: string | null) {
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    if ("answer" in r) {
      setOutcome({ kind: "answer", text: r.answer });
      return;
    }
    setPlan(r.plan);
    setVersion(r.version);
    setSeen(r.version);
    setStatus(r.status);
    setSuggestion(r.suggestion);
    setNote(r.note);
    if (r.changes.length) {
      setOutcome({ kind: "changed", changes: r.changes, version: r.version, request: req });
      setHighlight(new Set(r.changes.map((c) => c.section)));
    }
    router.refresh();
  }

  function ask(text: string) {
    const t = text.trim();
    if (!t) return;
    setStatus("REVISING");
    setOutcome(null);
    setSuggestion(null);
    start(async () => {
      const r = await askMairoAction(t, version).catch(() => ({ ok: false as const, error: "Mairo couldn't reach the server. Try again." }));
      if (!r.ok || "answer" in r) setStatus((s) => (s === "REVISING" ? "DRAFT" : s));
      apply(r, t);
      if (r.ok) setRequest("");
    });
  }

  function edit(e: ManualEdit) {
    setOutcome(null);
    start(async () => {
      const r = await editPlanAction(e, version).catch(() => ({ ok: false as const, error: "That change didn't save. Try again." }));
      apply(r, null);
      if (r.ok) setEditing(null);
    });
  }

  function takeSuggestion(s: Suggestion) {
    start(async () => {
      const r = await acceptSuggestionAction(s.patch, version).catch(() => ({ ok: false as const, error: "That didn't save. Try again." }));
      apply(r, null);
    });
  }

  function undo(v: number) {
    start(async () => {
      const r = await undoChangeAction(v).catch(() => ({ ok: false as const, error: "Undo didn't work. Try again." }));
      apply(r, null);
      if (r.ok) setSuggestion(null);
    });
  }

  function restore(target: number) {
    start(async () => {
      const r = await restoreVersionAction(target, version).catch(() => ({ ok: false as const, error: "That didn't work. Try again." }));
      apply(r, null);
      if (r.ok) window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function approve() {
    start(async () => {
      const r = await approvePlanNowAction(version).catch(() => ({ ok: false as const, error: "Approval didn't save. Try again." }));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      setStatus("APPROVED");
      router.refresh();
    });
  }

  function focusAsk() {
    askRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    askRef.current?.focus();
  }

  const lit = (k: SectionKey) => highlight.has(k);
  const sectionProps = (k: SectionKey, editable = false) => ({
    k,
    lit: lit(k),
    onEdit: editable && status !== "REVISING" ? () => setEditing(editing === k ? null : k) : undefined,
    editing: editing === k,
  });

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Free plan · {props.businessName}</p>
          <h1 className="mt-1 text-[clamp(26px,3.4vw,36px)] font-semibold tracking-[-0.02em]">Your Mairo Advertising Plan</h1>
          <p className="mt-1.5 max-w-[640px] text-[14.5px] text-muted">
            Review the strategy Mairo created for your business. You can change anything before moving forward.
          </p>
        </div>
        <StatusBadge status={status} version={version} />
      </div>

      {plan.summary && (
        <div className={`${card} mt-6 p-5`}>
          {version > 0 && <p className="mb-1.5 text-[11.5px] uppercase tracking-[0.14em] text-faint">Mairo&rsquo;s overview of the Original Plan · the sections below are current</p>}
          <p className="text-[15px] leading-relaxed text-white/90">{plan.summary}</p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* The plan */}
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <Section {...sectionProps("goal", true)}>
            <Big>{GOAL_LABEL[plan.goal]}</Big>
            <Why>{plan.goalWhy}</Why>
            {editing === "goal" && (
              <EditForm onCancel={() => setEditing(null)} pending={pending}
                onSave={(f) => edit({ section: "goal", goal: f.get("goal") as StrategyContent["goal"] })}>
                <select name="goal" defaultValue={plan.goal} className={input}>
                  {PLAN_GOALS.map((g) => <option key={g} value={g}>{GOAL_LABEL[g]}</option>)}
                </select>
              </EditForm>
            )}
          </Section>

          <Section {...sectionProps("platforms", true)}>
            <div className="flex items-center gap-2">
              {plan.platforms.includes("FACEBOOK") && <FacebookMark className="h-5 w-5" />}
              {plan.platforms.includes("INSTAGRAM") && <InstagramMark className="h-5 w-5" />}
              <Big>{platformsText(plan.platforms)}</Big>
            </div>
            <Why>{plan.platformsWhy}</Why>
            {editing === "platforms" && (
              <EditForm onCancel={() => setEditing(null)} pending={pending}
                onSave={(f) => edit({ section: "platforms", platforms: f.getAll("platforms") as StrategyContent["platforms"] })}>
                <div className="flex gap-4">
                  {PLATFORMS.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-[14px]">
                      <input type="checkbox" name="platforms" value={p} defaultChecked={plan.platforms.includes(p)} className="h-4 w-4 accent-[#7c5cff]" />
                      {PLATFORM_LABEL[p]}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-faint">Mairo runs on Meta: Facebook and Instagram.</p>
              </EditForm>
            )}
          </Section>

          <Section {...sectionProps("budget", true)}>
            <Big>{usd(plan.dailyBudget)}/day</Big>
            <p className="text-[12.5px] text-faint">About {usd(Math.round(plan.dailyBudget * 30))}/month, paid to Meta directly</p>
            <Why>{plan.budgetWhy}</Why>
            {editing === "budget" && (
              <EditForm onCancel={() => setEditing(null)} pending={pending}
                onSave={(f) => edit({ section: "budget", dailyBudget: Number(f.get("dailyBudget")) })}>
                <label className="flex items-center gap-2 text-[14px]">
                  $<input name="dailyBudget" type="number" min={5} max={5000} step={1} defaultValue={plan.dailyBudget} className={`${input} w-32`} aria-label="Daily budget in dollars" /> per day
                </label>
              </EditForm>
            )}
          </Section>

          <Section {...sectionProps("audience", true)}>
            <Big>{plan.audience.location || "Location to confirm"}</Big>
            <p className="text-[13px] text-white/80">Ages {agesText(plan.audience)}</p>
            {plan.audience.interests.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {plan.audience.interests.map((i) => (
                  <span key={i} className="rounded-full border border-white/10 px-2 py-0.5 text-[11.5px] text-white/80">{i}</span>
                ))}
              </div>
            )}
            <Why>{plan.audience.summary}</Why>
            {editing === "audience" && (
              <EditForm onCancel={() => setEditing(null)} pending={pending}
                onSave={(f) => edit({
                  section: "audience",
                  location: String(f.get("location") ?? ""),
                  ageMin: Number(f.get("ageMin")),
                  ageMax: Number(f.get("ageMax")),
                  interests: String(f.get("interests") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
                })}>
                <label className="block text-[12.5px] text-muted">Where
                  <input name="location" defaultValue={plan.audience.location} placeholder="City, region or country" className={`${input} mt-1`} />
                </label>
                <div className="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
                  Ages <input name="ageMin" type="number" min={18} max={65} defaultValue={plan.audience.ageMin} className={`${input} w-20`} aria-label="Youngest" />
                  to <input name="ageMax" type="number" min={18} max={65} defaultValue={plan.audience.ageMax} className={`${input} w-20`} aria-label="Oldest" />
                  {plan.audience.ageMax >= AGE_MAX && <span>(65 means 65+)</span>}
                </div>
                <label className="mt-2 block text-[12.5px] text-muted">Interests (comma-separated)
                  <input name="interests" defaultValue={plan.audience.interests.join(", ")} className={`${input} mt-1`} />
                </label>
              </EditForm>
            )}
          </Section>

          <Section {...sectionProps("campaignType", true)}>
            <Big>{campaignTypeInfo(plan.campaignType).label.split(" — ")[0]}</Big>
            <p className="text-[13px] text-white/80">{campaignTypeInfo(plan.campaignType).label.split(" — ")[1]}</p>
            <Why>{plan.campaignTypeWhy}</Why>
            {editing === "campaignType" && (
              <EditForm onCancel={() => setEditing(null)} pending={pending}
                onSave={(f) => edit({ section: "campaignType", campaignType: f.get("campaignType") as StrategyContent["campaignType"] })}>
                <select name="campaignType" defaultValue={plan.campaignType} className={input}>
                  {CAMPAIGN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </EditForm>
            )}
          </Section>

          <Section {...sectionProps("product", true)}>
            <Big>{plan.product || "Not set"}</Big>
            <Why>{plan.productWhy}</Why>
            {editing === "product" && (
              <EditForm onCancel={() => setEditing(null)} pending={pending}
                onSave={(f) => edit({ section: "product", product: String(f.get("product") ?? "") })}>
                <input name="product" defaultValue={plan.product} maxLength={200} className={input} placeholder="What should the ads promote?" />
              </EditForm>
            )}
          </Section>

          <Section {...sectionProps("offer", true)}>
            <Big>{plan.offer || "No offer"}</Big>
            <Why>{plan.offerWhy}</Why>
            {editing === "offer" && (
              <EditForm onCancel={() => setEditing(null)} pending={pending}
                onSave={(f) => edit({ section: "offer", offer: String(f.get("offer") ?? "") })}>
                <input name="offer" defaultValue={plan.offer} maxLength={200} className={input} placeholder="e.g. 20% off your first visit — leave empty for none" />
                <p className="mt-1.5 text-[12px] text-faint">Only an offer you really run — ads can&rsquo;t promise one you don&rsquo;t.</p>
              </EditForm>
            )}
          </Section>

          <Section {...sectionProps("creativeStrategy")}>
            <p className="text-[14px] leading-relaxed text-white/90">{plan.creativeStrategy}</p>
          </Section>

          <Section {...sectionProps("concepts")} wide>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {plan.concepts.map((c, i) => (
                <li key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-faint">{c.format}</p>
                  <p className="mt-1 text-[14px] font-medium text-white">{c.title}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{c.description}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section {...sectionProps("hooks")} wide>
            <ol className="space-y-1.5">
              {plan.hooks.map((h, i) => (
                <li key={i} className="flex gap-2 text-[14px] text-white/90">
                  <span className="text-faint">{i + 1}.</span>
                  <span>&ldquo;{h}&rdquo;</span>
                </li>
              ))}
            </ol>
          </Section>

          <Section {...sectionProps("retargeting")}>
            <p className="text-[14px] leading-relaxed text-white/90">{plan.retargeting}</p>
          </Section>

          <Section {...sectionProps("website")}>
            <ul className="space-y-1.5">
              {plan.website.map((w, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] leading-relaxed text-white/90">
                  <span aria-hidden className="text-violet-bright">•</span>
                  {w}
                </li>
              ))}
            </ul>
          </Section>

          <Section {...sectionProps("split")}>
            <ul className="space-y-3">
              {plan.split.map((s) => (
                <li key={s.label}>
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-white">{s.label}</span>
                    <span className="tabular-nums text-white">{s.percent}% · {usd(Math.round(plan.dailyBudget * s.percent) / 100)}/day</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full" style={{ width: `${s.percent}%`, backgroundImage: "var(--mairo-ramp)" }} />
                  </div>
                  <p className="mt-1 text-[12px] text-faint">{s.why}</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section {...sectionProps("structure")}>
            <ul className="space-y-2">
              {plan.structure.map((s, i) => (
                <li key={i} className={`border-l-2 pl-3 ${s.level === "Campaign" ? "border-violet/60" : s.level === "Ad set" ? "ml-3 border-white/20" : "ml-6 border-white/10"}`}>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-faint">{s.level}</p>
                  <p className="text-[13.5px] text-white">{s.name}</p>
                  <p className="text-[12px] text-muted">{s.detail}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* Ask Mairo */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className={`${card} p-5`}>
            <p className="text-[15px] font-semibold text-white">Want to change something?</p>
            <p className="mt-1 text-[13px] text-muted">Ask Mairo to adjust your plan before you approve it.</p>
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask(request);
              }}
            >
              <textarea
                ref={askRef}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(request);
                  }
                }}
                rows={3}
                maxLength={1000}
                aria-label="Tell Mairo what you want to change"
                placeholder={`Tell Mairo what you want to change… e.g. “${EXAMPLES[example]}”`}
                className="w-full resize-none rounded-lg border border-white/10 bg-[#0c1326] px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-faint focus:border-violet/60"
              />
              <button type="submit" disabled={pending || !request.trim()} className={`${primary} mt-2 w-full`}>
                {status === "REVISING" ? "Mairo is updating your plan…" : "Ask Mairo"}
              </button>
            </form>
          </div>

          {error && <p className="rounded-xl bg-alert/10 px-4 py-3 text-[13px] text-alert">{error}</p>}

          {outcome?.kind === "answer" && (
            <div className={`${card} p-5`}>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Mairo</p>
              <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-white/90">{outcome.text}</p>
              <button type="button" onClick={focusAsk} className={`${secondary} mt-3`}>Ask Mairo Something Else</button>
            </div>
          )}

          {outcome?.kind === "changed" && (
            <div className={`${card} border-violet/30 p-5`} role="status">
              <p className="text-[15px] font-semibold text-white">Got it. I updated your plan.</p>
              {outcome.request && <p className="mt-1 text-[12.5px] text-faint">You asked: &ldquo;{outcome.request}&rdquo;</p>}
              <ul className="mt-3 space-y-3">
                {outcome.changes.map((c) => (
                  <li key={c.section} className="rounded-lg bg-white/[0.03] p-3">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-violet-bright">
                      {SECTION_LABEL[c.section]}{c.dependent ? " · updated to match" : ""}
                    </p>
                    <p className="mt-1.5 text-[12.5px] text-faint">Previous: <span className="text-white/70 line-through decoration-white/30">{c.previous}</span></p>
                    <p className="text-[13px] text-white">Updated: {c.updated}</p>
                    <p className="mt-1 text-[12.5px] text-muted">Reason: {c.reason}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={pending || version !== outcome.version} onClick={() => undo(outcome.version)} className={secondary}>
                  Undo Change
                </button>
                <button type="button" onClick={focusAsk} className={secondary}>Ask Mairo Something Else</button>
              </div>
            </div>
          )}

          {suggestion && (
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] p-5">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-amber-200">Mairo Suggestion</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-white/90">{suggestion.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={pending} onClick={() => takeSuggestion(suggestion)} className={primary}>
                  Use Mairo Recommendation
                </button>
                <button type="button" onClick={() => setSuggestion(null)} className={secondary}>Keep My Choice</button>
              </div>
            </div>
          )}

          {note && <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-muted">{note}</p>}
        </aside>
      </div>

      <History revisions={props.revisions} current={version} pending={pending} onRestore={restore} />

      {/* Approval */}
      <div className={`${card} mt-8 p-6 sm:p-8`}>
        {status === "APPROVED" ? (
          <div>
            <p className="text-[22px] font-semibold text-emerald-300">Plan Approved ✓</p>
            <p className="mt-1 text-[15px] text-white/90">Your Mairo strategy is ready. Next, activate your account to turn this plan into a real campaign.</p>
            <form action={getStartedAction} className="mt-5">
              <button type="submit" className={`${primary} min-h-[48px] px-7 text-[15px]`}>Get Started With Mairo</button>
            </form>
            <p className="mt-3 max-w-[560px] text-[13px] text-muted">
              Choose your subscription, unlock the full platform, and let Mairo build this campaign inside your ad account.
            </p>
            <p className="mt-4 text-[12px] text-faint">Changed your mind about something? You can still ask Mairo or edit a section — you&rsquo;ll just approve the plan again.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[20px] font-semibold text-white">Happy with your plan?</p>
              <p className="mt-1 text-[14px] text-muted">Approve your strategy and Mairo will save it for your first campaign.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={pending || status === "REVISING"} onClick={approve} className={`${primary} min-h-[48px] px-7`}>
                Approve My Plan
              </button>
              <button type="button" onClick={focusAsk} className={`${secondary} min-h-[48px]`}>Make More Changes</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, version }: { status: Status; version: number }) {
  const label = status === "APPROVED" ? "Approved ✓" : status === "REVISING" ? "Updating…" : "Draft";
  const tone = status === "APPROVED" ? "border-emerald-400/30 text-emerald-300" : status === "REVISING" ? "animate-pulse border-violet/50 text-violet-bright" : "border-white/15 text-white/80";
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className={`rounded-full border px-3 py-1 ${tone}`}>{label}</span>
      <span className="text-faint">{version === 0 ? "Original Plan" : `Revision ${version}`}</span>
    </div>
  );
}

function Section({ k, lit, onEdit, editing, wide = false, children }: { k: SectionKey; lit: boolean; onEdit?: () => void; editing: boolean; wide?: boolean; children: React.ReactNode }) {
  return (
    <section
      id={`plan-${k}`}
      className={`${card} min-w-0 p-5 transition-[box-shadow,background-color] duration-700 ${wide ? "md:col-span-2" : ""} ${
        lit ? "bg-violet/[0.08] shadow-[0_0_0_2px_rgba(124,92,255,0.55)]" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-faint">{SECTION_LABEL[k]}</h2>
        {onEdit && (
          <button type="button" onClick={onEdit} className="rounded-md border border-white/10 px-2.5 py-1 text-[12px] text-white/80 hover:border-white/30" aria-expanded={editing}>
            {editing ? "Close" : "Edit"}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Big({ children }: { children: React.ReactNode }) {
  return <p className="text-[18px] font-semibold leading-snug text-white">{children}</p>;
}

function Why({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{children}</p>;
}

function EditForm({ children, onSave, onCancel, pending }: { children: React.ReactNode; onSave: (f: FormData) => void; onCancel: () => void; pending: boolean }) {
  return (
    <form
      className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(new FormData(e.currentTarget));
      }}
    >
      {children}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className="min-h-[40px] rounded-lg bg-[#7c5cff] px-4 text-[13px] font-medium text-white disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="min-h-[40px] rounded-lg px-3 text-[13px] text-muted hover:text-white">Cancel</button>
      </div>
    </form>
  );
}

function History({ revisions, current, pending, onRestore }: { revisions: RevisionView[]; current: number; pending: boolean; onRestore: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  if (revisions.length <= 1) return null;
  const shown = open ? revisions : revisions.slice(0, 3);
  return (
    <section className={`${card} mt-8 p-5`}>
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-white">Version history</h2>
        {revisions.length > 3 && (
          <button type="button" onClick={() => setOpen(!open)} className="text-[12.5px] text-violet-bright hover:text-white">
            {open ? "Show less" : `Show all ${revisions.length}`}
          </button>
        )}
      </div>
      <ol className="mt-3 space-y-2.5">
        {shown.map((r) => (
          <li key={r.version} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13.5px] font-medium text-white">
                {r.version === 0 ? "Original Plan" : `Revision ${r.version}`}
                {r.version === current && <span className="ml-2 text-[11.5px] font-normal text-emerald-300">current</span>}
              </p>
              <p className="text-[11.5px] text-faint">
                {r.requestedBy === "you" ? "Requested by you" : "Written by Mairo"} · {new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
            {r.request && <p className="mt-1 text-[12.5px] text-muted">&ldquo;{r.request}&rdquo;</p>}
            {r.version > 0 && <p className="mt-1 text-[12.5px] text-white/80">{r.summary}</p>}
            {[...new Set(r.changes.filter((c) => !c.dependent).map((c) => c.reason))].slice(0, 2).map((reason) => (
              <p key={reason} className="text-[12px] text-faint">Why: {reason}</p>
            ))}
            {r.version !== current && (
              <button type="button" disabled={pending} onClick={() => onRestore(r.version)} className="mt-2 text-[12px] text-violet-bright hover:text-white disabled:opacity-50">
                Go back to this version
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
