"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdPlatform } from "@/generated/prisma/enums";
import type { DefaultDestination } from "@/lib/campaigns/destination";
import { createCampaignAction, type CampaignActionState } from "@/lib/actions/campaign-actions";
import { reviewCampaignAction, saveCampaignDraftAction } from "@/lib/actions/campaign-wizard-actions";
import { OPEN_ASSISTANT_EVENT } from "@/components/mairo/assistant";
import { ViewToggle } from "@/components/mairo/app-shell";
import { inputClass } from "@/components/ui";
import { destinationsFor, goalOption, PROMOTES_OPTIONS, recommendedGoal } from "@/lib/campaigns/objectives";
import { PLACEMENT_OPTIONS } from "@/lib/campaigns/placements";
import { dollars, hasOwnWords, plannedSpend, runningCopy, WIZARD_STEPS, type CampaignPlan, type WizardStep } from "@/lib/campaigns/plan";
import { checkCopy } from "@/lib/campaigns/ad-copy";
import { campaignName, planFormEntries } from "@/lib/campaigns/plan-form";
import type { CampaignReview } from "@/lib/campaigns/review";
import type { ReviewStep } from "@/lib/campaigns/review-rules";
import { AdPreview } from "./ad-preview";
import { AnalysisScan } from "./analysis-scan";
import { StepAd, type StudioProps } from "./step-ad";
import { aiAudienceStrategy, StepAudience } from "./step-audience";
import { StepBudget } from "./step-budget";
import { StepBusiness } from "./step-business";
import { StepGoal } from "./step-goal";
import { StepReview } from "./step-review";
import { Question } from "./wizard-parts";

// The Create wizard: seven plain questions, one screen each, with what's been
// decided so far always visible beside them.
//
// It holds the whole campaign as one CampaignPlan. That shape is what a draft
// saves, what the review checks and what becomes the form createCampaignAction
// already accepts — so there is still exactly one launch path, with its
// entitlements, plan limits and validation, whichever screen someone used.
//
// Nothing is spent from here. Launching builds the campaign paused in the
// customer's own ad account; whether it then switches on by itself or waits
// for Approve is their standing choice in Settings, and the last screen says
// which before they agree to anything.

const STEPS = WIZARD_STEPS;
type StepId = WizardStep;

const REVIEW_INDEX = STEPS.findIndex((s) => s.id === "review");
const LAUNCH_INDEX = STEPS.findIndex((s) => s.id === "launch");

const NETWORK: Record<CampaignPlan["service"], string> = {
  meta: "Meta",
  tiktok: "TikTok",
  multi: "Meta and TikTok",
};

type SaveState = "idle" | "saving" | "saved" | "error";

type Props = {
  initialPlan: CampaignPlan;
  initialDraftId: string | null;
  initialStep: StepId;
  orgName: string;
  platforms: AdPlatform[];
  defaultDestination: DefaultDestination;
  pixelActive: boolean;
  businessPhone: string | null;
  /** The customer asked MAIRO to wait for Approve before anything goes live. */
  autoLaunchHeld: boolean;
  mode: "simple" | "advanced";
  studio: StudioProps;
  /** This campaign's networks that are connected right now. */
  connected: AdPlatform[];
  /** Arrived straight back from connecting Meta. */
  justConnected: boolean;
  /** Open the existing-post choices on arrival (after connecting for them). */
  openPosts: boolean;
};

export function CampaignWizard(props: Props) {
  const { orgName, platforms, defaultDestination, pixelActive, businessPhone, autoLaunchHeld, mode, studio, connected } = props;
  const missing = platforms.filter((p) => !connected.includes(p));
  const metaConnected = connected.includes("META");
  const router = useRouter();

  const [plan, setPlan] = useState<CampaignPlan>(() => ({
    ...props.initialPlan,
    // The server can't know the customer's time zone; a draft already carries one.
    timeZone: props.initialPlan.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  }));
  const [stepIndex, setStepIndex] = useState(() => STEPS.findIndex((s) => s.id === props.initialStep));
  const [reached, setReached] = useState(stepIndex);
  const [draftId, setDraftId] = useState<string | null>(props.initialDraftId);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const [review, setReview] = useState<CampaignReview | null>(null);
  const [reviewedPlan, setReviewedPlan] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const [confirmed, setConfirmed] = useState(false);
  const [customName, setCustomName] = useState("");

  const [state, formAction, pending] = useActionState<CampaignActionState, FormData>(createCampaignAction, undefined);
  const [attempt, setAttempt] = useState(0);
  const showAnalysis = attempt > 0 && (pending || !state?.error) && !state?.upgradeNeeded;

  const current = STEPS[stepIndex].id;
  const planKey = JSON.stringify(plan);
  const reviewStale = reviewedPlan !== planKey;

  const update = useCallback((patch: Partial<CampaignPlan>) => {
    setPlan((p) => ({ ...p, ...patch }));
    // Agreeing to spend is agreeing to this plan; any change asks again.
    setConfirmed(false);
  }, []);

  const draftIdRef = useRef<string | null>(props.initialDraftId);
  // One save at a time, and the latest wins — a slow save finishing after a
  // newer one must not put the older answers back.
  const saving = useRef<Promise<string | null> | null>(null);
  const saveDraft = useCallback(
    async (step: StepId, snapshot: CampaignPlan): Promise<string | null> => {
      await saving.current?.catch(() => null);
      const run = (async () => {
        setSaveState("saving");
        const result = await saveCampaignDraftAction({
          draftId: draftIdRef.current,
          step,
          label: campaignName(snapshot),
          plan: snapshot,
        }).catch(() => ({ ok: false as const, error: "offline" }));
        if (!result.ok) {
          setSaveState("error");
          return null;
        }
        draftIdRef.current = result.draftId;
        setDraftId(result.draftId);
        setSaveState("saved");
        // So a refresh, or the link, comes back to this draft.
        const url = new URL(window.location.href);
        if (url.searchParams.get("draft") !== result.draftId) {
          url.searchParams.set("draft", result.draftId);
          window.history.replaceState(null, "", url);
        }
        return result.draftId;
      })();
      saving.current = run;
      return run;
    },
    [],
  );

  const runReview = useCallback(async (snapshot: CampaignPlan) => {
    setChecking(true);
    setReviewError(null);
    const result = await reviewCampaignAction(snapshot).catch(() => ({
      ok: false as const,
      error: "MAIRO couldn't finish the review. Try again in a moment.",
    }));
    setChecking(false);
    if (result.ok) {
      setReview(result.review);
      setReviewedPlan(JSON.stringify(snapshot));
    } else {
      setReviewError(result.error);
    }
  }, []);

  function goTo(index: number) {
    // The launch screen only ever shows a plan the review has seen.
    const target = index >= REVIEW_INDEX && reviewStale ? REVIEW_INDEX : index;
    setStepIndex(target);
    setReached((r) => Math.max(r, target));
    window.scrollTo({ top: 0, behavior: "smooth" });
    void saveDraft(STEPS[target].id, plan);
    if (target === REVIEW_INDEX && (reviewStale || !review)) void runReview(plan);
  }

  /**
   * Saves the draft, then sends them to connect Meta and back to this exact
   * screen — so connecting never costs them what they've planned.
   */
  async function connectMeta(extra = "") {
    const id = (await saveDraft(current, plan)) ?? draftIdRef.current;
    const params = new URLSearchParams();
    if (id) params.set("draft", id);
    if (extra) params.set(extra, "1");
    const back = `/dashboard/create/${plan.service}?${params.toString()}`;
    // A full page load on purpose: this is an API route that hands off to
    // Facebook's sign-in, not a page the client router can show.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/api/meta/connect?returnTo=${encodeURIComponent(back)}`;
  }

  function fix(step: ReviewStep) {
    goTo(STEPS.findIndex((s) => s.id === step));
  }

  // Set before the first await, so a second click can't start a second launch
  // while the first is still saving the draft.
  const launching = useRef(false);
  async function launch() {
    if (!confirmed || pending || launching.current) return;
    launching.current = true;
    // The draft is what makes a second click harmless: the server claims it
    // before building, so only one request can ever build this campaign.
    const id = (await saveDraft("launch", plan)) ?? draftIdRef.current;
    const fd = new FormData();
    for (const [k, v] of planFormEntries(plan, { draftId: id, name: mode === "advanced" ? customName : undefined })) {
      fd.append(k, v);
    }
    setAttempt((n) => n + 1);
    startTransition(() => formAction(fd));
  }

  // A draft reopened at the review is checked again against the account as
  // it is now; a saved review would be about yesterday's account.
  const reviewedOnOpen = useRef(false);
  useEffect(() => {
    if (reviewedOnOpen.current || props.initialStep !== "review") return;
    reviewedOnOpen.current = true;
    void runReview(plan);
  }, [props.initialStep, plan, runReview]);

  // The action revalidates and returns rather than redirecting.
  useEffect(() => {
    if (attempt === 0 || pending) return;
    // Finished: released only now, so a retry after an error is possible.
    launching.current = false;
    if (!state?.error && !state?.upgradeNeeded) router.push("/dashboard/campaigns");
  }, [attempt, pending, state, router]);

  // Follows what they said they're advertising on the first screen.
  const recommended = recommendedGoal({ promotes: plan.promotes, defaultDestination, hasActivePixel: pixelActive });
  const blocked =
    current === "launch" && missing.length > 0
      ? "Connect your account above to make the campaign."
      : blockedBecause(current, plan, { review, reviewStale, checking, confirmed });
  const spend = plannedSpend(plan);

  return (
    <>
      {showAnalysis && <AnalysisScan businessName={plan.businessName || orgName} platforms={platforms} />}

      <div className={showAnalysis ? "hidden" : "grid gap-8 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[190px_minmax(0,1fr)_290px]"}>
        {/* Steps. A rail on the left on desktop; a compact line on phones. */}
        <nav aria-label="Campaign steps" className="lg:sticky lg:top-8 lg:self-start">
          <p className="mb-3 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-faint lg:block">
            {NETWORK[plan.service]} campaign
          </p>
          <ol className="hidden space-y-1 lg:block">
            {STEPS.map((s, i) => {
              const done = i < stepIndex || (i <= reached && i !== stepIndex);
              const here = i === stepIndex;
              const open = i <= reached;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => open && goTo(i)}
                    disabled={!open}
                    aria-current={here ? "step" : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                      here ? "bg-white/[0.05] text-white" : open ? "text-muted hover:text-white" : "text-faint"
                    }`}
                  >
                    <span
                      className="flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px]"
                      style={{
                        borderColor: here ? "rgba(108,158,255,0.6)" : "var(--mairo-line)",
                        backgroundImage: here ? "var(--mairo-ramp)" : undefined,
                        color: here ? "white" : undefined,
                      }}
                      aria-hidden
                    >
                      {done && !here ? "✓" : i + 1}
                    </span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="lg:hidden">
            <p className="text-[12px] text-muted">
              Step {stepIndex + 1} of {STEPS.length} · <span className="text-white">{STEPS[stepIndex].label}</span>
            </p>
            <div className="mt-2 flex gap-1.5" aria-hidden>
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className="h-0.5 flex-1 rounded-full"
                  style={i <= stepIndex ? { backgroundImage: "var(--mairo-ramp)" } : { background: "var(--mairo-line)" }}
                />
              ))}
            </div>
          </div>
          <div className="mt-6 hidden lg:block">
            <ViewToggle mode={mode} />
            <p className="mt-2 text-[11px] leading-relaxed text-faint">
              {mode === "simple" ? "Advanced shows placements and the Meta settings behind each answer." : "Switch any time — your answers stay."}
            </p>
          </div>
        </nav>

        {/* The question. */}
        <section
          className="min-w-0"
          onKeyDown={(e) => {
            // Enter in a text box answers it, it doesn't jump a screen.
            if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
          }}
        >
          {props.justConnected && missing.length === 0 && (
            <p className="mb-6 rounded-xl border px-4 py-3 text-[13px] text-live" style={{ borderColor: "rgba(52,211,153,0.3)", background: "rgba(52,211,153,0.05)" }}>
              Connected — carry on where you left off.
            </p>
          )}
          {missing.length > 0 && (
            <div className="mb-8 rounded-xl border p-5" style={{ borderColor: "rgba(251,191,36,0.3)", background: "rgba(251,191,36,0.05)" }}>
              <p className="text-[14px] text-white">
                Connect your {missing.map((p) => (p === "META" ? "Facebook & Instagram" : "TikTok")).join(" and ")} account to make this campaign
              </p>
              <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted">
                You can plan everything now — it saves as you go — but MAIRO can&rsquo;t create the campaign until the account is
                connected. Nothing is spent before then.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {missing.includes("META") && (
                  <button type="button" onClick={() => void connectMeta()}
                    className="rounded-full px-4 py-2 text-[12.5px] font-medium text-white" style={{ backgroundImage: "var(--mairo-ramp)" }}>
                    Connect Facebook &amp; Instagram
                  </button>
                )}
                {missing.includes("TIKTOK") && (
                  <Link href="/dashboard/integrations" className="rounded-full border px-4 py-2 text-[12.5px] text-white/90" style={{ borderColor: "var(--mairo-line)" }}>
                    Connect TikTok
                  </Link>
                )}
              </div>
            </div>
          )}

          {current === "business" && <StepBusiness plan={plan} update={update} orgName={orgName} />}
          {current === "goal" && (
            <StepGoal plan={plan} update={update} recommended={recommended} pixelActive={pixelActive} businessPhone={businessPhone} mode={mode} />
          )}
          {current === "audience" && <StepAudience plan={plan} update={update} mode={mode} />}
          {current === "budget" && <StepBudget plan={plan} update={update} />}
          {current === "ad" && (
            <StepAd
              plan={plan}
              update={update}
              studio={studio}
              metaConnected={metaConnected}
              onConnectMeta={() => void connectMeta("posts")}
              openPosts={props.openPosts}
            />
          )}
          {current === "review" && (
            <StepReview review={reviewStale ? null : review} error={reviewError} checking={checking} onRecheck={() => void runReview(plan)} onFix={fix} />
          )}
          {current === "launch" && (
            <Question
              title="Ready to launch?"
              sub="Everything MAIRO will build, in one place. Nothing is spent until you agree below."
            >
              <PlanSummary plan={plan} mode={mode} detailed />

              {plan.service !== "tiktok" && <AdPreview plan={plan} />}

              {mode === "advanced" && (
                <label className="mt-6 block max-w-lg">
                  <span className="text-[12.5px] text-white/85">Campaign name</span>
                  <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={campaignName(plan)}
                    maxLength={120} className={`${inputClass} mt-1.5`} />
                </label>
              )}

              <div className="mt-6 rounded-xl border p-4 text-[13px] leading-relaxed text-muted" style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">What happens next</p>
                <p className="mt-2">
                  MAIRO builds the campaign in your own {NETWORK[plan.service]} ad account, switched off.{" "}
                  {autoLaunchHeld
                    ? "It then waits: nothing runs until you press Approve on the Campaigns page, because you've asked MAIRO to hold before going live."
                    : `Once the ad is ready and ${NETWORK[plan.service]} can charge your payment method, MAIRO switches it on — that's when spending starts. You can pause it any time.`}
                </p>
              </div>

              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border p-4"
                style={{ borderColor: confirmed ? "rgba(108,158,255,0.5)" : "var(--mairo-line)", background: confirmed ? "rgba(61,125,255,0.06)" : "transparent" }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#6c9eff]" />
                <span className="text-[13px] leading-relaxed text-white/90">
                  {spend.maxCents !== null
                    ? `I agree to spend up to ${dollars(spend.maxCents)} in total on this campaign, charged by ${NETWORK[plan.service]} to my ad account.`
                    : `I agree to spend ${dollars(spend.perDayCents)} a day (about ${dollars(spend.per30DaysCents)} every 30 days) on this campaign until I pause or stop it, charged by ${NETWORK[plan.service]} to my ad account.`}
                </span>
              </label>

              {state?.error && (
                <div className="mt-5 rounded-xl border border-alert/30 bg-alert/[0.06] px-4 py-3 text-[13px] text-alert">
                  <p>{state.error}</p>
                  {state.partial && state.partial.length > 1 && (
                    <ul className="mt-2 list-disc pl-5 text-[12px]">
                      {state.partial.map((p) => <li key={p.platform}>{p.platform}: {p.error}</li>)}
                    </ul>
                  )}
                </div>
              )}
              {state?.upgradeNeeded && (
                <p className="mt-5 rounded-xl border px-4 py-3 text-[13px] text-amber-200/90" style={{ borderColor: "rgba(251,191,36,0.25)" }}>
                  Your plan doesn&rsquo;t include this.{" "}
                  <Link href="/dashboard/plan" className="underline underline-offset-4">See plans</Link>
                </p>
              )}
            </Question>
          )}

          {/* Moving on. */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6" style={{ borderColor: "var(--mairo-line)" }}>
            <button type="button" onClick={() => goTo(Math.max(0, stepIndex - 1))}
              className={`text-[13px] text-muted transition-colors hover:text-white ${stepIndex === 0 ? "invisible" : ""}`}>
              ← Back
            </button>
            <div className="flex flex-wrap items-center gap-3">
              <SaveNote state={saveState} />
              <button type="button" onClick={() => void saveDraft(current, plan)} disabled={pending}
                className="rounded-full border px-4 py-2.5 text-[12.5px] text-white/85 transition hover:text-white disabled:opacity-40" style={{ borderColor: "var(--mairo-line)" }}>
                Save draft
              </button>
              {/* Keyed apart so a Continue click can never land on Launch. */}
              {stepIndex < LAUNCH_INDEX ? (
                <button key="next" type="button" onClick={() => goTo(stepIndex + 1)} disabled={blocked !== null}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[13px] font-medium text-white transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
                  style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}>
                  {current === "review" ? "Continue to launch" : "Continue"}
                  <span aria-hidden>→</span>
                </button>
              ) : (
                <button key="launch" type="button" onClick={() => void launch()} disabled={blocked !== null || pending}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[13px] font-medium text-white transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
                  style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}>
                  {pending ? "Building…" : "Launch campaign"}
                  <span aria-hidden>→</span>
                </button>
              )}
            </div>
          </div>
          {blocked && <p className="mt-3 text-right text-[12px] text-faint">{blocked}</p>}

          {/* Phones: the summary and the assistant after the question. */}
          <div className="mt-10 xl:hidden">
            <details className="rounded-xl border" style={{ borderColor: "var(--mairo-line)" }}>
              <summary className="cursor-pointer px-4 py-3 text-[13px] text-white">Your campaign so far</summary>
              <div className="px-4 pb-4">
                <PlanSummary plan={plan} mode={mode} />
              </div>
            </details>
            <AskMairo name={studio.assistantName} step={current} plan={plan} />
          </div>
        </section>

        {/* What's decided so far, and help. Desktop only; phones get it inline. */}
        <aside className="hidden xl:sticky xl:top-8 xl:block xl:self-start">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-faint">Your campaign so far</p>
            <div className="mt-3">
              <PlanSummary plan={plan} mode={mode} />
            </div>
          </div>
          <AskMairo name={studio.assistantName} step={current} plan={plan} />
          {draftId && (
            <p className="mt-3 text-[11px] text-faint">Saved as a draft — you can leave and come back from Create.</p>
          )}
        </aside>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- rules */

/** What stops Continue on this screen, said rather than just greyed out. */
function blockedBecause(
  step: StepId,
  plan: CampaignPlan,
  ctx: { review: CampaignReview | null; reviewStale: boolean; checking: boolean; confirmed: boolean },
): string | null {
  switch (step) {
    case "business":
      if (!plan.businessName.trim()) return "Add the name of the business.";
      if (!plan.promotes) return "Choose what we're advertising.";
      if (!plan.offering.trim()) return "Tell MAIRO what the business sells — it writes the ad from it.";
      return null;
    case "goal": {
      if (!plan.goal) return "Choose what the ad should accomplish.";
      if (goalOption(plan.goal).metaOnly && plan.service !== "meta") return "That goal runs on Meta only.";
      if (!plan.destinationType) return "Choose where people go.";
      if (plan.destinationType === "WEBSITE" && !plan.destinationValue.trim()) return "Add the page people should visit.";
      if (plan.destinationType === "PHONE_CALL" && !plan.destinationValue.trim()) return "Add the number people should call.";
      if (plan.destinationType === "APP" && (!plan.destinationValue.trim() || !plan.metaAppId.trim())) {
        return "Add your app's store link and Meta app id.";
      }
      return null;
    }
    case "audience":
      if (plan.audienceMode === "manual" && plan.ageMin > plan.ageMax) return "The youngest age is above the oldest.";
      if (plan.choosingPlacements && plan.placements.length === 0) return "Pick at least one place, or let Meta choose.";
      return null;
    case "budget":
      if (plan.budgetType === "DAILY" && plan.dailyAmount < 1) return "Enter a daily budget of at least $1.";
      if (plan.budgetType === "LIFETIME" && plan.lifetimeAmount < 1) return "Enter the total you want to spend.";
      if (plan.startOnDate && !plan.startLocal) return "Pick a start date, or start as soon as it's approved.";
      if ((plan.endOnDate || plan.budgetType === "LIFETIME") && !plan.endLocal) return "Pick an end date.";
      return null;
    case "ad": {
      if (plan.adChoice === "none") return "Choose how to make the ad.";
      if ((plan.adChoice === "FACEBOOK_POST" || plan.adChoice === "INSTAGRAM_POST") && !plan.selectedPost) return "Pick a post, or choose another way.";
      if (plan.adChoice === "EXISTING_AD" && !plan.existingAd) return "Pick which ad to run, or choose another way.";
      if (plan.adChoice === "generate" || plan.adChoice === "upload") return "Finish the ad and attach it, or choose another way.";
      if (plan.adChoice === "video" && !plan.video) return "Upload the video, or choose another way.";
      if (plan.adChoice === "images" && (plan.images ?? []).length === 0) return "Add at least one picture, or choose another way.";
      if (hasOwnWords(plan)) {
        const words = runningCopy(plan);
        if (words.length === 0) return "Choose the words for your ad.";
        if (words.some((w) => checkCopy(w, plan.destinationType).some((f) => f.level === "problem"))) {
          return "Fix the ad's words first.";
        }
      }
      return null;
    }
    case "review":
      if (ctx.checking || !ctx.review || ctx.reviewStale) return "Waiting for the review.";
      if (ctx.review.status === "SETUP_REQUIRED") return "Fix what the review found first.";
      return null;
    case "launch":
      if (!ctx.review || ctx.reviewStale) return "Something changed — check the review again.";
      if (ctx.review.status === "SETUP_REQUIRED") return "Fix what the review found first.";
      if (!ctx.confirmed) return "Tick the box to agree to the spend.";
      return null;
  }
}

/* ---------------------------------------------------------------- pieces */

function SaveNote({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <span className={`text-[11.5px] ${state === "error" ? "text-amber-200/90" : "text-faint"}`} role="status">
      {state === "saving" ? "Saving…" : state === "saved" ? "Draft saved" : "Couldn't save the draft"}
    </span>
  );
}

const AD_LABEL: Record<CampaignPlan["adChoice"], string> = {
  none: "Not chosen yet",
  generate: "Being made with AI",
  upload: "Being uploaded",
  attached: "A picture, ready",
  video: "Your video",
  images: "Your own pictures",
  EXISTING_AD: "An ad you've run before",
  later: "MAIRO writes it after the campaign is built",
  FACEBOOK_POST: "An existing Facebook post",
  INSTAGRAM_POST: "An existing Instagram post",
};

const SPECIAL_LABEL: Record<string, string> = {
  HOUSING: "Housing",
  EMPLOYMENT: "Jobs",
  FINANCIAL_PRODUCTS_SERVICES: "Financial services",
  ISSUES_ELECTIONS_POLITICS: "Politics or social issues",
};

function PlanSummary({ plan, mode, detailed = false }: { plan: CampaignPlan; mode: "simple" | "advanced"; detailed?: boolean }) {
  const spend = plannedSpend(plan);
  const goal = plan.goal ? goalOption(plan.goal) : null;
  const destination = plan.goal && plan.destinationType
    ? destinationsFor(plan.goal).find((d) => d.type === plan.destinationType)
    : null;
  const promotes = PROMOTES_OPTIONS.find((o) => o.value === plan.promotes)?.label;
  const audience =
    plan.audienceMode === "ai"
      ? detailed ? aiAudienceStrategy(plan) : `Found by MAIRO${plan.geoLabel ? ` near ${plan.geoLabel}` : ", across the US"}`
      : `${plan.geoLabel ? `Within ${plan.geoRadius} mi of ${plan.geoLabel}` : "Across the US"}, ages ${plan.ageMin}–${plan.ageMax}${plan.genders === 1 ? ", men" : plan.genders === 2 ? ", women" : ""}`;
  const budget = plan.budgetType === "LIFETIME" ? `${dollars(Math.round(plan.lifetimeAmount * 100))} in total` : `${dollars(Math.round(plan.dailyAmount * 100))} a day`;
  const when = `${plan.startOnDate && plan.startLocal ? `From ${fmt(plan.startLocal)}` : "Starts once approved"}${
    (plan.endOnDate || plan.budgetType === "LIFETIME") && plan.endLocal ? `, ends ${fmt(plan.endLocal)}` : ", no end date"
  }`;

  const rows: [string, string | null][] = [
    ["Business", plan.businessName || null],
    ["Advertising", promotes ? `${promotes}${plan.promotesDetail.trim() ? ` — ${plan.promotesDetail.trim()}` : ""}` : null],
    ["Goal", goal ? `${goal.label}${mode === "advanced" ? ` (${goal.metaObjective})` : ""}` : null],
    ["People go to", destination ? `${destination.label}${plan.destinationValue.trim() && plan.destinationType !== "DIRECT_MESSAGE" ? ` — ${plan.destinationValue.trim()}` : ""}` : null],
    ["Audience", audience],
    ...(plan.specialAdCategory ? [["Special category", SPECIAL_LABEL[plan.specialAdCategory]] as [string, string]] : []),
    ...(plan.service !== "tiktok" && (mode === "advanced" || plan.choosingPlacements)
      ? [["Shows on", plan.choosingPlacements ? PLACEMENT_OPTIONS.filter((p) => plan.placements.includes(p.value)).map((p) => p.label).join(", ") || "—" : "Where Meta finds it works best"] as [string, string]]
      : []),
    ["Budget", `${budget}${plan.service === "multi" ? ` · Meta ${plan.metaPercent}% / TikTok ${100 - plan.metaPercent}%` : ""}`],
    ["When", when],
    ["Planned spend", spend.maxCents !== null ? `Up to ${dollars(spend.maxCents)}` : `About ${dollars(spend.per30DaysCents)} per 30 days`],
    ...(hasOwnWords(plan) && runningCopy(plan).length > 0
      ? [["Words", runningCopy(plan).length > 1 ? `${runningCopy(plan).length} versions, tested against each other` : `“${runningCopy(plan)[0].headline || runningCopy(plan)[0].primaryText.slice(0, 50)}”`] as [string, string]]
      : []),
    ["Ad", plan.adChoice === "images" ? `${(plan.images ?? []).length} of your own picture${(plan.images ?? []).length === 1 ? "" : "s"}, each its own ad` : plan.adChoice === "EXISTING_AD" && plan.existingAd ? `${AD_LABEL.EXISTING_AD} — ${plan.existingAd.name}` : plan.selectedPost ? `${AD_LABEL[plan.adChoice]}${plan.selectedPost.message ? ` — “${plan.selectedPost.message.slice(0, 60)}”` : ""}` : AD_LABEL[plan.adChoice]],
  ];

  return (
    <dl className={detailed ? "grid gap-x-6 gap-y-3 rounded-xl border p-5 sm:grid-cols-[150px_minmax(0,1fr)]" : "space-y-2.5"}
      style={detailed ? { borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" } : undefined}>
      {rows.map(([k, v]) =>
        detailed ? (
          <div key={k} className="contents">
            <dt className="text-[12px] text-faint">{k}</dt>
            <dd className="text-[13px] text-white/90">{v ?? "—"}</dd>
          </div>
        ) : (
          <div key={k}>
            <dt className="text-[11px] text-faint">{k}</dt>
            <dd className="text-[12.5px] leading-snug text-white/90">{v ?? "—"}</dd>
          </div>
        ),
      )}
      {detailed && plan.attachedPreview && plan.adChoice === "attached" && (
        <div className="contents">
          <dt className="text-[12px] text-faint">Preview</dt>
          {/* eslint-disable-next-line @next/next/no-img-element -- remote blob URL, see studio-workspace.tsx */}
          <dd><img src={plan.attachedPreview} alt="Your advertisement" className="max-w-[220px] rounded-lg border" style={{ borderColor: "var(--mairo-line)" }} /></dd>
        </div>
      )}
    </dl>
  );
}

const TIPS: Record<StepId, string> = {
  business: "The more specific you are about what you sell and who buys it, the better the ad copy and audience.",
  goal: "Pick the result you actually want. Meta optimizes for exactly what you choose — clicks and sales find different people.",
  audience: "Broad usually beats narrow on Meta. Let it learn unless your customers must be in one place.",
  budget: "Meta needs a few days of steady spend to learn. Changing the budget often resets that learning.",
  ad: "Ads with a clear photo of what you sell, and one simple message, tend to do best.",
  review: "Blocking items stop a launch that would fail or waste money. Recommendations are yours to take or leave.",
  launch: "You can pause or stop the campaign from Campaigns at any time.",
};

function AskMairo({ name, step, plan }: { name: string; step: StepId; plan: CampaignPlan }) {
  return (
    <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--mairo-line)" }}>
      <p className="text-[12.5px] leading-relaxed text-muted">{TIPS[step]}</p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT))}
        className="mt-3 rounded-full border px-4 py-2 text-[12px] text-white/85 transition hover:text-white"
        style={{ borderColor: "var(--mairo-line)" }}
      >
        Ask {name} about {plan.goal && step !== "business" ? "this campaign" : "this step"}
      </button>
    </div>
  );
}

function fmt(local: string): string {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? local : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
