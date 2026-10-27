// The setup steps from "tell us about your business" to "your first campaign
// is live", each read from what actually exists — never from which screen
// somebody last opened. That is what makes leaving and coming back safe: the
// next visit starts at the first step that isn't finished, on any device.
//
// The steps are grouped into nine phases for the progress bar (PHASES):
// business, goal, strategy, free plan, creatives, video, account and payment,
// approval and launch, and next steps. The three ad directions come before
// any account setup: the owner sees what their ads could be before being
// asked to connect anything or pay.
//
// Pure: the facts come from progress-store.ts; the screens and the tests
// share this.

import { explainCampaignError, explainConnectionState, explainSubscription, type Problem } from "./problems";

export type StepId = "business" | "learn" | "goal" | "plan" | "edit" | "approve" | "creative" | "video" | "connect" | "pixel" | "subscribe" | "prepare" | "launch";

export type PhaseId = "business" | "goal" | "strategy" | "free-plan" | "creatives" | "video" | "account" | "launch" | "next";

/** The nine phases the progress bar shows, and the steps in each. "Next steps" begins once the campaign is live. */
export const PHASES: { id: PhaseId; label: string; steps: StepId[] }[] = [
  { id: "business", label: "Business", steps: ["business", "learn"] },
  { id: "goal", label: "Goal", steps: ["goal"] },
  { id: "strategy", label: "Strategy", steps: ["plan", "edit"] },
  { id: "free-plan", label: "Free plan", steps: ["approve"] },
  { id: "creatives", label: "Creatives", steps: ["creative"] },
  { id: "video", label: "Video", steps: ["video"] },
  { id: "account", label: "Account & payment", steps: ["connect", "pixel", "subscribe"] },
  { id: "launch", label: "Approval & launch", steps: ["prepare", "launch"] },
  { id: "next", label: "Next steps", steps: [] },
];

/**
 * done, or skipped (fine to move past: no website to read, approved without
 * changes); current is the next thing to do; attention needs fixing first;
 * waiting is on someone else (Meta's ad review).
 */
export type StepState = "done" | "skipped" | "current" | "todo" | "attention" | "waiting";

export type OnboardingStep = {
  n: number;
  id: StepId;
  label: string;
  /** Why it's asked, in a sentence. */
  why: string;
  /** Who does it: the owner, or MAIRO's team. */
  who: "you" | "mairo";
  state: StepState;
  detail: string | null;
  href: string | null;
  problem: Problem | null;
};

export type OnboardingFacts = {
  /** The first screen was saved, or the intake exists. */
  business: boolean;
  website: string | null;
  /** Reading the website: done, tried and failed, or not yet. */
  learned: { state: "read" | "failed" | "none"; note: string | null };
  /** The intake (goal, budget) is saved. */
  goal: boolean;
  plan: { status: string; yourChanges: number; activated: boolean } | null;
  meta: { status: string; adAccount: string | null; pageName: string | null; hasPage: boolean; expiresAt: Date | null } | null;
  subscription: { paid: boolean; status: string | null; trial: boolean; planName: string | null };
  /** The Meta Pixel: what this business needs, the owner's choice, and what Meta reports. Absent: not asked yet. */
  pixel?: {
    need: "required_for_purchases" | "optional";
    decision: "use" | "declined" | null;
    status: "not_set_up" | "declined" | "access_lost" | "selected_not_receiving" | "receiving" | "purchases_verified";
    leadMeasurement: string | null;
  };
  /** The suggested ads: how many directions, whether one is approved as it is now, and the owner's own videos. */
  creative?: { directions: number; approved: boolean; videos: number };
  campaign: {
    /** A Create draft from the plan exists, and the screen it's on. */
    draftStep: string | null;
    built: boolean;
    /** The last build attempt failed, and Meta's words. */
    buildError: string | null;
    launchApproved: boolean;
    live: boolean;
    /** Meta refused to switch it on, in its words. */
    launchError: string | null;
    id: string | null;
  };
  now?: Date;
};

const host = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

export function onboardingSteps(f: OnboardingFacts): OnboardingStep[] {
  const steps: OnboardingStep[] = [];
  const add = (s: Omit<OnboardingStep, "n" | "problem"> & { problem?: Problem | null }) => steps.push({ n: steps.length + 1, problem: null, ...s });

  add({
    id: "business",
    label: "Tell MAIRO about your business",
    why: "So your plan is about your business, not a template.",
    who: "you",
    state: f.business ? "done" : "todo",
    detail: f.business && f.website ? host(f.website) : null,
    href: "/onboarding",
  });

  // Reading the website. No website, or one that couldn't be read, is fine
  // to move past — the plan then says its website advice is general.
  const laterDone = f.goal || Boolean(f.plan);
  add({
    id: "learn",
    label: "MAIRO learns about your business",
    why: "Your Strategy Agent reads your website to see what you sell and who it's for.",
    who: "mairo",
    state: !f.business ? "todo" : !f.website ? "skipped" : f.learned.state === "read" ? "done" : f.learned.state === "failed" || laterDone ? "skipped" : "todo",
    detail: !f.business
      ? null
      : !f.website
        ? "No website given — MAIRO works from your answers."
        : f.learned.state === "read"
          ? `Read ${host(f.website)}`
          : f.learned.state === "failed" || laterDone
            ? (f.learned.note ?? "MAIRO couldn't read your website, so its website advice is general.")
            : null,
    href: "/onboarding?step=learn",
  });

  add({
    id: "goal",
    label: "Choose your goal",
    why: "Sales, leads or appointments — it decides what your ads ask people to do.",
    who: "you",
    state: f.goal ? "done" : "todo",
    detail: null,
    href: "/onboarding?step=goal",
  });

  add({
    id: "plan",
    label: "Get your free advertising plan",
    why: "Written from your answers. Free — nothing is built or spent.",
    who: "mairo",
    state: f.plan ? "done" : "todo",
    detail: null,
    href: "/plan",
  });

  const approved = Boolean(f.plan && (f.plan.status === "APPROVED" || f.plan.activated));
  add({
    id: "edit",
    label: "Adjust it with the AI assistant",
    why: "Optional. Ask for any change in your own words, or keep it as it is.",
    who: "you",
    state: !f.plan ? "todo" : f.plan.yourChanges > 0 ? "done" : approved ? "skipped" : "todo",
    detail: !f.plan ? null : f.plan.yourChanges > 0 ? `${f.plan.yourChanges} change${f.plan.yourChanges === 1 ? "" : "s"} made` : approved ? "Approved as written" : "Optional — or approve it as it is",
    href: "/plan",
  });

  add({
    id: "approve",
    label: "Approve your free strategy",
    why: "Your campaign is built from exactly what you approve.",
    who: "you",
    state: approved ? "done" : "todo",
    detail: null,
    href: "/plan",
  });

  // The three ad directions, before any account setup. Free to read, change
  // and approve. Past it once one is approved — or once the business has
  // moved on to paying or building, where the campaign builder writes its
  // own ads.
  const cr = f.creative ?? { directions: 0, approved: false, videos: 0 };
  const movedOn = f.subscription.paid || f.campaign.built || Boolean(f.plan?.activated);
  add({
    id: "creative",
    label: "Review your first ads",
    why: "Three ad directions written from your business, one marked as the best first test. Choose one, change it, or turn one down for another. Free.",
    who: "you",
    state: cr.approved ? "done" : movedOn ? "skipped" : "todo",
    detail: cr.approved ? "One approved — ready for your campaign" : movedOn ? "Your campaign's ads are written in the campaign builder" : cr.directions ? `${cr.directions} directions waiting for you` : null,
    href: "/dashboard/creatives/suggested",
  });

  add({
    id: "video",
    label: "Add your own video (optional)",
    why: "If you have footage, MAIRO trims it, crops it for Stories and Reels, and adds captions — every edit kept as a version.",
    who: "you",
    state: cr.videos > 0 ? "done" : cr.approved || movedOn ? "skipped" : "todo",
    detail: cr.videos > 0 ? `${cr.videos} video${cr.videos === 1 ? "" : "s"} added` : cr.approved || movedOn ? "Skipped — you can add one any time" : "Optional",
    href: "/dashboard/creatives/suggested",
  });

  const connectedProblem = f.meta ? explainConnectionState({ status: f.meta.status, expiresAt: f.meta.expiresAt, hasPage: f.meta.hasPage }, { returnTo: "/plan/activate", now: f.now }) : null;
  const connected = f.meta?.status === "CONNECTED" && Boolean(f.meta.adAccount);
  add({
    id: "connect",
    label: "Connect your Meta ad account",
    why: "Your ads run in your own Meta account. Connecting doesn't build or spend anything.",
    who: "you",
    state: connectedProblem ? "attention" : connected ? "done" : "todo",
    detail: connectedProblem ? connectedProblem.title : connected ? [f.meta!.adAccount, f.meta!.pageName ? `Page: ${f.meta!.pageName}` : null].filter(Boolean).join(" · ") : null,
    href: "/plan/activate",
    problem: connectedProblem,
  });

  // The Meta Pixel, once Meta is connected. Required before an online shop's
  // purchase campaigns launch; optional for everyone else (tracking/pixel-rules.ts).
  // Declining is an answer, so it moves the setup on either way — for a shop
  // the launch gate is what then holds a purchase campaign, and says why.
  const px = f.pixel ?? { need: "optional" as const, decision: null, status: "not_set_up" as const, leadMeasurement: null };
  const shop = px.need === "required_for_purchases";
  const chosen = px.status !== "not_set_up" && px.status !== "declined";
  add({
    id: "pixel",
    label: shop ? "Connect your Meta Pixel" : "Connect your Meta Pixel (optional)",
    why: shop
      ? "Needed to measure purchases on your website, and before MAIRO launches a campaign aimed at website purchases."
      : "Optional. Lets MAIRO count enquiries on your website. Calls, forms and leads you mark are counted without it.",
    who: "you",
    // Optional and not yet answered is fine to move past: it never holds up a
    // business that doesn't need it. A shop that hasn't answered is asked.
    state: !connected ? "todo" : px.status === "access_lost" ? "attention" : chosen ? "done" : px.decision === "declined" || !shop ? "skipped" : "todo",
    detail: !connected
      ? null
      : px.status === "access_lost"
        ? "MAIRO can't reach the Pixel you chose — re-check access"
        : px.status === "selected_not_receiving"
          ? "Chosen — not receiving website events yet"
          : px.status === "receiving" || px.status === "purchases_verified"
            ? "Chosen and receiving website events"
            : px.decision === "declined"
              ? shop
                ? "Not connected — purchase campaigns can't launch without it"
                : "Not connected — leads measured another way"
              : shop
                ? null
                : "Optional — connect one any time",
    href: "/dashboard/pixel?returnTo=%2Fdashboard%2Flaunch",
  });

  const payment = explainSubscription(f.subscription.status, { paid: f.subscription.paid });
  add({
    id: "subscribe",
    label: "Activate your MAIRO plan",
    why: "Your subscription lets MAIRO build and run the campaign. Your ad budget is paid to Meta separately.",
    who: "you",
    state: f.subscription.paid ? "done" : payment ? "attention" : "todo",
    detail: f.subscription.paid ? [f.subscription.planName, f.subscription.trial ? "free trial" : null].filter(Boolean).join(" · ") || null : payment?.title ?? null,
    href: f.subscription.paid ? "/dashboard/billing" : "/plan/activate?skip=1#plans",
    problem: payment,
  });

  const campaignHref = f.campaign.id ? `/dashboard/campaigns/${f.campaign.id}` : "/dashboard/launch";
  const buildProblem = !f.campaign.built && f.campaign.buildError ? explainCampaignError(f.campaign.buildError, { campaignHref: "/dashboard/launch", returnTo: "/dashboard/launch" }) : null;
  add({
    id: "prepare",
    label: "MAIRO prepares your campaign",
    why: "Built in your Meta account, switched off, from the plan you approved.",
    who: "mairo",
    state: f.campaign.built ? "done" : buildProblem ? "attention" : "todo",
    detail: f.campaign.built ? "Built in your ad account, switched off" : buildProblem ? buildProblem.title : f.campaign.draftStep ? "Started — continue where you left off" : null,
    href: "/dashboard/launch",
    problem: buildProblem,
  });

  const launchProblem = f.campaign.launchError && !f.campaign.live ? explainCampaignError(f.campaign.launchError, { campaignHref, returnTo: "/dashboard/launch" }) : null;
  add({
    id: "launch",
    label: "Approve the details, budget and launch",
    why: "Nothing spends until you say yes here.",
    who: "you",
    state: f.campaign.live ? "done" : launchProblem ? "attention" : f.campaign.launchApproved ? "waiting" : "todo",
    detail: f.campaign.live
      ? "Live — Meta confirmed it's running"
      : launchProblem
        ? launchProblem.title
        : f.campaign.launchApproved
          ? "You approved it. It starts once Meta approves the ad and confirms your payment method."
          : null,
    href: "/dashboard/launch",
    problem: launchProblem,
  });

  // The first step that isn't finished is the one to do next.
  const focus = steps.find((s) => s.state !== "done" && s.state !== "skipped");
  if (focus && focus.state === "todo") focus.state = "current";
  return steps;
}

export function focusStep(steps: OnboardingStep[]): OnboardingStep | null {
  return steps.find((s) => s.state !== "done" && s.state !== "skipped") ?? null;
}

export type PhaseView = { id: PhaseId; n: number; label: string; state: StepState; steps: OnboardingStep[] };

/** The nine phases, each as done, current, needing attention, waiting or to do — from its steps. */
export function onboardingPhases(steps: OnboardingStep[]): PhaseView[] {
  const live = steps.find((s) => s.id === "launch")?.state === "done";
  return PHASES.map((p, i) => {
    const mine = steps.filter((s) => p.steps.includes(s.id));
    let state: StepState;
    if (p.id === "next") state = live ? "current" : "todo";
    else if (mine.every((s) => s.state === "done" || s.state === "skipped")) state = mine.every((s) => s.state === "skipped") ? "skipped" : "done";
    else if (mine.some((s) => s.state === "attention")) state = "attention";
    else if (mine.some((s) => s.state === "waiting")) state = "waiting";
    else if (mine.some((s) => s.state === "current")) state = "current";
    else state = "todo";
    return { id: p.id, n: i + 1, label: p.label, state, steps: mine };
  });
}

export function progressCount(steps: OnboardingStep[]): { finished: number; total: number } {
  return { finished: steps.filter((s) => s.state === "done" || s.state === "skipped").length, total: steps.length };
}

/** Where "Continue setup" goes: the next unfinished step, or the dashboard once live. */
export function resumeHref(steps: OnboardingStep[]): string {
  const f = focusStep(steps);
  if (!f) return "/dashboard";
  if (f.problem?.fix && !f.problem.fix.external) return f.problem.fix.href;
  return f.href ?? "/dashboard";
}
