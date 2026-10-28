"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import {
  chooseInstallAction,
  confirmPlatformAction,
  deferSetupAction,
  detectPlatformAction,
  markInstalledAction,
  resumeSetupAction,
  saveGoalsAction,
  saveWebsiteAction,
  suggestGoalsAction,
  verifyMeasurementAction,
} from "@/lib/actions/measurement-actions";
import {
  COMPLETED_CALLS_NOTE,
  EVENT_STATUS_LABEL,
  GOALS,
  GOAL_ORDER,
  PLATFORMS,
  SHOPPING_JOURNEY,
  SHOPPING_PRESET,
  type EventStatus,
  type GoalId,
  type SitePlatform,
  type Suggestion,
} from "@/lib/tracking/measurement";
import type { MeasurementView } from "@/lib/tracking/measurement-store";
import { PixelSetup } from "./pixel-setup";

// The guided tracking setup: website → what to measure → Pixel → install →
// check → what it shows. One step open at a time, with one main button; the
// steps already done fold into a line with "Change". The same page serves
// onboarding (with returnTo) and Settings → Tracking. Every state shown comes
// from the server's records; nothing here decides that anything works.

type StepId = "website" | "goals" | "pixel" | "install" | "verify";
type Note = { ok: boolean; text: string } | null;

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const fmtDay = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const STATE_TONE: Record<MeasurementView["state"]["state"], "green" | "yellow" | "red" | "neutral"> = {
  not_started: "neutral",
  goals_saved: "yellow",
  pixel_selected: "yellow",
  installation_needed: "yellow",
  waiting_for_verification: "yellow",
  receiving_events: "green",
  needs_attention: "red",
  deferred: "neutral",
  no_website_tracking: "green",
};
const EVENT_TONE: Record<EventStatus, "green" | "yellow" | "red" | "neutral"> = { verified: "green", not_seen: "yellow", not_checked: "neutral", missing_value: "red", permission: "red", failed: "red" };

function currentStep(v: MeasurementView, skipWebsite: boolean): StepId | null {
  if (v.deferredAt) return null;
  if (!v.goalsSavedAt && !skipWebsite && (!v.website || !v.platform.confirmed)) return "website";
  if (!v.goalsSavedAt || v.goals.length === 0) return "goals";
  const pixelGoals = v.goals.filter((g) => GOALS[g].source === "pixel");
  if (pixelGoals.length === 0) return null;
  if (!v.website || !v.platform.confirmed) return "website";
  if (!v.pixel.pixel) return "pixel";
  if (["pixel_selected", "installation_needed"].includes(v.state.state)) return "install";
  return "verify";
}

export function MeasurementSetup({ view, returnTo, reconnectHref }: { view: MeasurementView; returnTo: string | null; reconnectHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<Note>(null);
  const [skipWebsite, setSkipWebsite] = useState(false);
  const [open, setOpen] = useState<StepId | null>(null);
  const [deferring, setDeferring] = useState(false);
  const step = open ?? currentStep(view, skipWebsite);
  const pixelGoals = view.goals.filter((g) => GOALS[g].source === "pixel");
  const needsWebsiteTracking = pixelGoals.length > 0;

  const run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setNote(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) {
        setOpen(null);
        after?.();
      }
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {/* Where things stand */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6" aria-labelledby="status-title">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="status-title" className="text-base font-medium text-white">Where you are</h2>
          <Badge tone={STATE_TONE[view.state.state]}>{view.state.label}</Badge>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-300">{view.state.next}</p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          Creating a Pixel, installing tracking on your website and Meta receiving real events are three separate steps — MAIRO shows each one, and only calls tracking working once Meta has received the events.
        </p>
        {view.deferredAt ? (
          <button type="button" className={`${primaryButtonClass} mt-4`} disabled={pending} onClick={() => run(resumeSetupAction)}>
            Continue setting up
          </button>
        ) : (
          !deferring &&
          view.state.state !== "receiving_events" && (
            <button type="button" className="mt-3 min-h-11 text-sm text-neutral-400 underline underline-offset-4 hover:text-white sm:pointer-fine:min-h-0" onClick={() => setDeferring(true)}>
              Set this up later
            </button>
          )
        )}
        {deferring && (
          <div className="mt-4 rounded-xl border border-white/10 p-4">
            <p className="text-sm font-medium text-white">Set up tracking later?</p>
            <p className="mt-1 text-sm text-neutral-400">Nothing is measured until you finish. What depends on it:</p>
            <Dependencies view={view} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => run(deferSetupAction, () => setDeferring(false))}>
                Set up later
              </button>
              <button type="button" className="min-h-11 px-3 text-sm text-neutral-400 hover:text-white" onClick={() => setDeferring(false)}>
                Keep going
              </button>
            </div>
          </div>
        )}
      </section>

      {note && (
        <p role="status" className={`text-sm ${note.ok ? "text-emerald-300" : "text-red-300"}`}>
          {note.text}
        </p>
      )}

      <Step
        n={1}
        title="Your website"
        open={step === "website"}
        done={Boolean(view.website && view.platform.confirmed)}
        summary={view.website ? `${view.website}${view.platform.confirmed ? ` · ${PLATFORMS[view.platform.confirmed]}` : " · platform not confirmed"}` : skipWebsite ? "No website — measuring without one" : "Not added yet"}
        onChange={() => setOpen("website")}
      >
        <WebsiteStep view={view} pending={pending} run={run} onSkip={() => { setSkipWebsite(true); setOpen("goals"); }} />
      </Step>

      <Step
        n={2}
        title="What you want to measure"
        open={step === "goals"}
        done={Boolean(view.goalsSavedAt && view.goals.length)}
        summary={view.goals.length ? view.goals.map((g) => GOALS[g].label).join(", ") : "Not chosen yet"}
        onChange={() => setOpen("goals")}
      >
        <GoalsStep view={view} pending={pending} run={run} hasWebsite={Boolean(view.website)} />
      </Step>

      {needsWebsiteTracking && (
        <>
          <Step
            n={3}
            title="Your Meta Pixel"
            open={step === "pixel"}
            done={Boolean(view.pixel.pixel)}
            summary={view.pixel.pixel ? `${view.pixel.pixel.name}` : "Not chosen yet"}
            onChange={() => setOpen("pixel")}
          >
            <p className="mb-4 text-sm leading-relaxed text-neutral-300">
              The Pixel is where your website sends these events in Meta. Use one you already have — it keeps its history — or create one. Choosing a Pixel doesn&rsquo;t put anything on your website.
            </p>
            <PixelSetup view={view.pixel} returnTo={null} reconnectHref={reconnectHref} embedded />
          </Step>

          <Step
            n={4}
            title="Put it on your website"
            open={step === "install"}
            done={["waiting_for_verification", "receiving_events"].includes(view.state.state) || view.state.events.some((e) => e.status === "verified")}
            summary={view.installMarkedAt ? `You marked it installed on ${fmt(view.installMarkedAt)}` : view.plan ? view.plan.title : "Steps not shown yet"}
            onChange={() => setOpen("install")}
            locked={!view.pixel.pixel || !view.platform.confirmed}
          >
            <InstallStep view={view} pending={pending} run={run} />
          </Step>

          <Step
            n={5}
            title="Check it's working"
            open={step === "verify"}
            done={view.state.state === "receiving_events"}
            summary={`${view.state.events.filter((e) => e.status === "verified").length} of ${view.state.events.length} events received`}
            onChange={() => setOpen("verify")}
            locked={!view.pixel.pixel}
          >
            <VerifyStep view={view} pending={pending} run={run} reconnectHref={reconnectHref} />
          </Step>
        </>
      )}

      {view.goalsSavedAt && view.goals.length > 0 && <Report view={view} />}

      <details className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <summary className="min-h-11 cursor-pointer text-sm text-white sm:pointer-fine:min-h-0">What depends on tracking</summary>
        <Dependencies view={view} />
      </details>

      {returnTo && view.goalsSavedAt && (
        <Link href={returnTo} className={secondaryButtonClass}>
          Back to your setup
        </Link>
      )}
    </div>
  );
}

function Step({ n, title, open, done, summary, onChange, locked, children }: { n: number; title: string; open: boolean; done: boolean; summary: string; onChange: () => void; locked?: boolean; children: ReactNode }) {
  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${open ? "border-white/20 bg-white/[0.04]" : "border-white/10 bg-white/[0.02]"}`} aria-labelledby={`step-${n}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`step-${n}`} className="flex items-center gap-2 text-base font-medium text-white">
            <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs ${done ? "bg-emerald-400/20 text-emerald-300" : "bg-white/10 text-neutral-300"}`}>{done ? "✓" : n}</span>
            {title}
          </h2>
          {!open && <p className="mt-1 break-words pl-8 text-sm text-neutral-400">{summary}</p>}
        </div>
        {!open && !locked && (
          <button type="button" className="min-h-11 text-sm text-violet-bright underline underline-offset-4 sm:pointer-fine:min-h-0" onClick={onChange}>
            {done ? "Change" : "Open"}
          </button>
        )}
      </div>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

type Run = (fn: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) => void;

function WebsiteStep({ view, pending, run, onSkip }: { view: MeasurementView; pending: boolean; run: Run; onSkip: () => void }) {
  const [site, setSite] = useState(view.website ?? "");
  const [platform, setPlatform] = useState<SitePlatform | "">(view.platform.confirmed ?? view.platform.guess?.platform ?? "");
  const [editing, setEditing] = useState(!view.website);
  if (editing) {
    return (
      <div>
        <label htmlFor="site" className="text-sm text-white">Your website address</label>
        <input id="site" className={`${inputClass} mt-2`} value={site} onChange={(e) => setSite(e.target.value)} placeholder="yourshop.com" inputMode="url" autoCapitalize="none" autoComplete="url" />
        <p className="mt-2 text-xs text-neutral-500">MAIRO only reads your public pages to suggest your platform. Adding your address doesn&rsquo;t give MAIRO access to your website or install anything.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className={primaryButtonClass} disabled={pending || !site.trim()} onClick={() => run(() => saveWebsiteAction(site), () => setEditing(false))}>
            {pending ? "Reading your website…" : "Save and continue"}
          </button>
          <button type="button" className="min-h-11 text-sm text-neutral-400 underline underline-offset-4 hover:text-white sm:pointer-fine:min-h-0" onClick={onSkip}>
            I don&rsquo;t have a website
          </button>
        </div>
      </div>
    );
  }
  const guess = view.platform.guess;
  return (
    <div>
      <p className="text-sm text-neutral-300">
        <span className="text-white">{view.website}</span>{" "}
        <button type="button" className="ml-1 min-h-11 text-violet-bright underline underline-offset-4 sm:pointer-fine:min-h-0" onClick={() => setEditing(true)}>Change</button>
      </p>
      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-white">Which platform is your website on?</legend>
        <p className="mt-1 text-sm text-neutral-400">
          {guess
            ? `MAIRO ${guess.confidence === "certain" ? "found signs of" : "thinks it might be"} ${PLATFORMS[guess.platform]}${guess.evidence ? ` (${guess.evidence.toLowerCase()})` : ""}. Please confirm — a page reading can be wrong.`
            : view.platform.readAt
              ? "MAIRO couldn't tell from your website. Choose the one you use."
              : "Choose the one you use."}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(PLATFORMS) as SitePlatform[]).map((p) => (
            <label key={p} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm ${platform === p ? "border-violet/60 bg-violet/[0.08] text-white" : "border-white/10 text-neutral-300 hover:border-white/25"}`}>
              <input type="radio" name="platform" className="h-4 w-4 shrink-0" checked={platform === p} onChange={() => setPlatform(p)} />
              <span>{PLATFORMS[p]}</span>
              {guess?.platform === p && <Badge tone="neutral">Detected</Badge>}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButtonClass} disabled={pending || !platform} onClick={() => run(() => confirmPlatformAction(platform))}>
          Confirm platform
        </button>
        <button type="button" className="min-h-11 text-sm text-neutral-400 underline underline-offset-4 hover:text-white sm:pointer-fine:min-h-0" disabled={pending} onClick={() => run(detectPlatformAction)}>
          Read my website again
        </button>
      </div>
    </div>
  );
}

function GoalsStep({ view, pending, run, hasWebsite }: { view: MeasurementView; pending: boolean; run: Run; hasWebsite: boolean }) {
  const [suggestion, setSuggestion] = useState<Suggestion>(view.suggestion);
  const [picked, setPicked] = useState<Set<GoalId>>(new Set(view.goals.length ? view.goals : view.suggestion.goals));
  const [asking, setAsking] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const shopFirst = suggestion.preset === "shopping_journey";
  const toggle = (g: GoalId) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(g)) n.delete(g);
    else n.add(g);
    return n;
  });
  const groups: { id: "shopping" | "leads"; title: string }[] = shopFirst
    ? [{ id: "shopping", title: "Shopping" }, { id: "leads", title: "Enquiries and sign-ups" }]
    : [{ id: "leads", title: "Enquiries, calls and sign-ups" }, { id: "shopping", title: "Shopping" }];

  const ask = async () => {
    setAsking(true);
    const r = await suggestGoalsAction();
    setAsking(false);
    if (!r.ok) return setAiNote(r.error);
    setSuggestion(r.suggestion);
    setPicked(new Set(r.suggestion.goals));
    setAiNote(r.suggestion.source === "ai" ? "Suggested by MAIRO's AI from what it knows about your business. Change anything you like." : "MAIRO's suggestion from your business type and website.");
  };

  return (
    <div>
      {shopFirst && (
        <div className="mb-4 rounded-xl border border-violet/40 bg-violet/[0.06] p-4">
          <p className="text-sm font-medium text-white">{SHOPPING_PRESET.title}</p>
          <p className="mt-1 text-sm text-neutral-300">{SHOPPING_PRESET.detail}</p>
          <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => setPicked((s) => new Set([...s, ...SHOPPING_JOURNEY]))}>
            Use the full shopping journey
          </button>
        </div>
      )}
      {groups.map((grp) => (
        <fieldset key={grp.id} className="mt-4 first:mt-0">
          <legend className="text-[11px] uppercase tracking-[0.14em] text-neutral-500">{grp.title}</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GOAL_ORDER.filter((g) => GOALS[g].group === grp.id).map((g) => {
              const goal = GOALS[g];
              const disabled = goal.source === "pixel" && !hasWebsite;
              return (
                <label key={g} className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 text-sm ${disabled ? "cursor-not-allowed opacity-50" : ""} ${picked.has(g) ? "border-violet/60 bg-violet/[0.08]" : "border-white/10 hover:border-white/25"}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={picked.has(g)} disabled={disabled} onChange={() => toggle(g)} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-white">{goal.label}</span>
                      {suggestion.goals.includes(g) && <Badge tone="green">Suggested</Badge>}
                      {goal.source !== "pixel" && <Badge tone="neutral">No website setup</Badge>}
                    </span>
                    <span className="mt-0.5 block text-neutral-400">{goal.detail}</span>
                    {suggestion.why[g] && <span className="mt-0.5 block text-xs text-neutral-500">{suggestion.why[g]}</span>}
                    {disabled && <span className="mt-0.5 block text-xs text-neutral-500">Needs a website.</span>}
                  </span>
                </label>
              );
            })}
          </div>
          {grp.id === "leads" && <p className="mt-2 text-xs leading-relaxed text-neutral-500">{COMPLETED_CALLS_NOTE}</p>}
        </fieldset>
      ))}
      {aiNote && <p className="mt-3 text-xs text-neutral-400" role="status">{aiNote}</p>}
      <details className="mt-4 rounded-xl border border-white/10 p-4">
        <summary className="min-h-11 cursor-pointer text-sm text-white sm:pointer-fine:min-h-0">How each one is set up in Meta</summary>
        <ul className="mt-3 space-y-2 text-xs text-neutral-400">
          {GOAL_ORDER.filter((g) => picked.has(g)).map((g) => (
            <li key={g}>
              <span className="text-neutral-200">{GOALS[g].label}</span> — {GOALS[g].event ? `Meta event “${GOALS[g].event}”. ` : "Counted outside the Pixel. "}
              {GOALS[g].when} {GOALS[g].never}
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={primaryButtonClass} disabled={pending || picked.size === 0} onClick={() => run(() => saveGoalsAction(GOAL_ORDER.filter((g) => picked.has(g))))}>
          Save what to measure
        </button>
        <button type="button" className="min-h-11 text-sm text-neutral-400 underline underline-offset-4 hover:text-white sm:pointer-fine:min-h-0" disabled={asking} onClick={ask}>
          {asking ? "Thinking…" : "Suggest for my business"}
        </button>
      </div>
    </div>
  );
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2">
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-neutral-200">{text}</pre>
      <button
        type="button"
        className="mt-2 min-h-11 text-sm text-violet-bright underline underline-offset-4 sm:pointer-fine:min-h-0"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setDone(true));
        }}
      >
        {done ? "Copied" : label}
      </button>
    </div>
  );
}

function InstallStep({ view, pending, run }: { view: MeasurementView; pending: boolean; run: Run }) {
  const plan = view.plan;
  if (!plan) return <p className="text-sm text-neutral-400">Confirm your website&rsquo;s platform and choose what to measure first.</p>;
  const existing = view.existingTracking;
  const otherPixel = existing?.metaPixelIds.filter((id) => id !== view.pixel.pixel?.id) ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium text-white">{plan.title}</p>
        <Badge tone="neutral">{plan.method === "native" ? "Your platform's own integration" : "One line of code"}</Badge>
      </div>
      <p className="mt-1 text-sm text-neutral-300">{plan.summary}</p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-neutral-300">
        {plan.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {plan.method === "mairo_tag" && view.snippet && <Copy text={view.snippet} label="Copy the line" />}
      {plan.notCovered.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/[0.05] p-3 text-sm text-amber-100">
          {plan.notCovered.map((n) => (
            <p key={n.goal}>
              <strong className="font-medium">{GOALS[n.goal].label}:</strong> {n.why}
            </p>
          ))}
        </div>
      )}
      {otherPixel.length > 0 && (
        <p className="mt-3 text-sm text-amber-200">Your website already loads a different Meta Pixel ({otherPixel.join(", ")}). Remove it, or choose that Pixel instead, so events aren&rsquo;t split or counted twice.</p>
      )}
      {existing && existing.gtm.length > 0 && (
        <p className="mt-3 text-sm text-neutral-400">
          Your website uses Google Tag Manager ({existing.gtm.join(", ")}). MAIRO can publish the tags there for you once you connect Google:{" "}
          <Link href="/dashboard/tracking#gtm" className="text-violet-bright underline underline-offset-4">Tag Manager setup</Link>. Use that or the steps above, not both.
        </p>
      )}
      <details className="mt-4 rounded-xl border border-white/10 p-4">
        <summary className="min-h-11 cursor-pointer text-sm text-white sm:pointer-fine:min-h-0">Details: server events, duplicates and consent</summary>
        <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-neutral-400">
          <li>{plan.server}</li>
          {plan.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
          <li>MAIRO&rsquo;s tag waits for consent when your consent setting asks it to, and does nothing for visitors who send Global Privacy Control. Form contents, names, emails and phone numbers are never sent.</li>
        </ul>
      </details>
      {view.developerNotes && (
        <details className="mt-3 rounded-xl border border-white/10 p-4">
          <summary className="min-h-11 cursor-pointer text-sm text-white sm:pointer-fine:min-h-0">Send these steps to your developer</summary>
          <Copy text={view.developerNotes} label="Copy the developer notes" />
          <p className="mt-1 text-xs text-neutral-500">These are instructions, not an installation. MAIRO checks with Meta once they&rsquo;re live.</p>
        </details>
      )}
      <div className="mt-4">
        {!view.installRoute ? (
          <button type="button" className={primaryButtonClass} disabled={pending} onClick={() => run(chooseInstallAction)}>
            Use this method
          </button>
        ) : (
          <button type="button" className={primaryButtonClass} disabled={pending} onClick={() => run(markInstalledAction)}>
            {pending ? "Checking…" : "I've done these steps"}
          </button>
        )}
      </div>
    </div>
  );
}

function VerifyStep({ view, pending, run, reconnectHref }: { view: MeasurementView; pending: boolean; run: Run; reconnectHref: string }) {
  const permission = view.state.events.some((e) => e.status === "permission");
  return (
    <div>
      <p className="text-sm leading-relaxed text-neutral-300">
        Do each one yourself once — a test enquiry, add something to your cart, a test order you then cancel or refund — then check. MAIRO asks Meta about each event separately, over the last 7 days.
      </p>
      <ul className="mt-4 divide-y divide-white/10 rounded-xl border border-white/10">
        {view.state.events.map((e) => {
          const c = view.checks[e.event];
          const d = view.dedup[e.event];
          return (
            <li key={e.event} className="p-3.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-white">{GOALS[e.goal].label}</span>
                <Badge tone={EVENT_TONE[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge>
              </div>
              {c && <p className="mt-1 text-neutral-400">{c.detail} <span className="text-neutral-500">· checked {fmt(c.checkedAt)}</span></p>}
              {e.event === "Purchase" && view.purchaseParams && <p className="mt-1 text-neutral-400">{view.purchaseParams.detail}</p>}
              {d && (
                <details className="mt-1">
                  <summary className="min-h-11 cursor-pointer text-xs text-neutral-500 sm:pointer-fine:min-h-0">Browser and server copies</summary>
                  <p className="mt-1 text-xs text-neutral-400">{d.detail}</p>
                </details>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Want to watch events arrive live? Open Meta Events Manager → your Pixel → Test events. Test events aren&rsquo;t counted in your results, and MAIRO never sends a made-up event to pass a check.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={primaryButtonClass} disabled={pending} onClick={() => run(verifyMeasurementAction)}>
          {pending ? "Asking Meta…" : "Check with Meta"}
        </button>
        {permission && <a href={reconnectHref} className={secondaryButtonClass}>Reconnect Meta</a>}
      </div>
    </div>
  );
}

function Report({ view }: { view: MeasurementView }) {
  const r = view.report;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6" aria-labelledby="report-title">
      <h2 id="report-title" className="text-base font-medium text-white">What MAIRO can see</h2>
      <p className="mt-1 text-sm text-neutral-400">From the last check with Meta. Anything MAIRO can&rsquo;t read is shown as unavailable, never as zero.</p>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {r.rows.map((row) => (
          <li key={row.goal} className="rounded-xl border border-white/10 p-3.5">
            <p className="text-xs text-neutral-500">{row.label}</p>
            <p className="mt-1 text-lg font-medium text-white">{row.value === null ? "Unavailable" : `${row.value.toLocaleString("en-US")} ${row.unit}`}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {row.source}
              {row.window ? ` · ${fmtDay(row.window.start)}–${fmtDay(row.window.end)}` : ""}
              {row.checkedAt ? ` · checked ${fmt(row.checkedAt.toString())}` : ""}
              {row.stale ? " · may be out of date" : ""}
            </p>
            <p className="mt-1 text-xs text-neutral-400">{row.limitation}</p>
          </li>
        ))}
        {r.storeOrders && (
          <li className="rounded-xl border border-white/10 p-3.5">
            <p className="text-xs text-neutral-500">Store orders</p>
            <p className="mt-1 text-lg font-medium text-white">
              {r.storeOrders.count} orders · {(r.storeOrders.revenueCents / 100).toLocaleString("en-US", { style: "currency", currency: r.storeOrders.currency })}
            </p>
            <p className="mt-1 text-xs text-neutral-500">Your store, as it reported them · last 7 days</p>
            <p className="mt-1 text-xs text-neutral-400">Orders recorded by your store — a different count from Meta&rsquo;s purchase events, so they&rsquo;re shown side by side, not compared.</p>
          </li>
        )}
      </ul>
      {"steps" in r.funnel && r.funnel.steps ? (
        <div className="mt-5">
          <p className="text-sm font-medium text-white">Where shoppers drop off</p>
          <p className="mt-1 text-xs text-neutral-500">Event counts from your Pixel over the same 7 days — not people, and not sales Meta credits to an ad.</p>
          <ol className="mt-3 space-y-2">
            {r.funnel.steps.map((s) => {
              const top = r.funnel.steps![0].events || 1;
              return (
                <li key={s.goal} className="text-sm">
                  <div className="flex justify-between gap-2 text-neutral-300">
                    <span>{s.label}</span>
                    <span>{s.events.toLocaleString("en-US")}{s.fromPrevious !== null ? ` · ${Math.round(s.fromPrevious * 100)}% of the step before` : ""}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-white/5">
                    <div className="h-2 rounded-full bg-[image:var(--mairo-ramp)]" style={{ width: `${Math.max(2, Math.round((s.events / top) * 100))}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
      {r.insights.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-medium text-white">MAIRO&rsquo;s reading</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-300">
            {r.insights.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="mt-4">
        <summary className="min-h-11 cursor-pointer text-xs text-neutral-500 sm:pointer-fine:min-h-0">What these numbers are, and aren&rsquo;t</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-neutral-400">
          <li>Website events: how many events Meta received from your Pixel. {r.uniquePeople.why}</li>
          <li>Conversions Meta credits to your ads use Meta&rsquo;s attribution and are on each campaign&rsquo;s results — a different number.</li>
          <li>Store orders come from your store, when it&rsquo;s connected to MAIRO.</li>
        </ul>
      </details>
    </section>
  );
}

function Dependencies({ view }: { view: MeasurementView }) {
  return (
    <ul className="mt-2 space-y-1.5 text-sm text-neutral-300">
      {view.dependencies.map((d) => (
        <li key={d.feature}>
          <span className="text-white">{d.feature}:</span> {d.needs}
        </li>
      ))}
    </ul>
  );
}
