import type { SavedPlan } from "@/lib/preview/saved-plan";
import { setupGoalFor } from "@/lib/preview/strategy";
import type { PreviewGoal } from "@/lib/preview/build";

// The one question the quick start from a free plan asks: where a tap on an
// ad should send people. The same choices as the full setup, by goal, and a
// suggestion from what the free plan already knows. Pure: the start page, its
// action and scripts/check-refine.ts.

export type StartDestination = "WEBSITE" | "PHONE_CALL" | "LEAD_FORM" | "DIRECT_MESSAGE";

const LEAD: { key: StartDestination; label: string; sub: string }[] = [
  { key: "LEAD_FORM", label: "They fill in a form", sub: "MAIRO writes the questions and hosts it for you" },
  { key: "PHONE_CALL", label: "They call me", sub: "A tap-to-call button on the ad" },
  { key: "DIRECT_MESSAGE", label: "They message me", sub: "The ad opens a chat with your Facebook Page" },
  { key: "WEBSITE", label: "They enquire or book on my website", sub: "Your own contact or booking page" },
];
const GENERAL: { key: StartDestination; label: string; sub: string }[] = [
  { key: "WEBSITE", label: "They go to my website", sub: "A shop, a booking page, anything online" },
  { key: "PHONE_CALL", label: "They call me", sub: "A tap-to-call button on the ad" },
];

export function destinationsForStart(goal: ReturnType<typeof setupGoalFor> | string) {
  return goal === "LEADS" ? LEAD : GENERAL;
}

/** A sensible first answer from the plan: the website when there is one, else a form (leads) or a call. */
export function suggestedDestination(plan: SavedPlan): StartDestination {
  const goal = setupGoalFor(plan.inputs.goal as PreviewGoal);
  if (goal === "LEADS") return plan.inputs.website && !plan.facts.usesLeadForm ? "WEBSITE" : "LEAD_FORM";
  return plan.inputs.website ? "WEBSITE" : "PHONE_CALL";
}
