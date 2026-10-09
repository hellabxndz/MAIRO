// The ten steps from "tell us about your business" to "your first campaign is
// live", each read from what actually exists — never from which screen
// somebody last opened. That is what makes leaving and coming back safe: the
// next visit starts at the first step that isn't finished, on any device.
//
// Pure: the facts come from progress-store.ts; the screens and the tests
// share this.

import { explainCampaignError, explainConnectionState, explainSubscription, type Problem } from "./problems";

export type StepId = "business" | "learn" | "goal" | "plan" | "edit" | "approve" | "connect" | "subscribe" | "prepare" | "launch";

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
