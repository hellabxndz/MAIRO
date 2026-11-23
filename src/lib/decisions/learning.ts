import type { CampaignSnapshot } from "./types";

// Meta's learning period, as MAIRO judges it: a campaign is compared and
// changed only after this many days of delivery and this much spend in the
// last week. Its own module so the decision rules and the creative report
// (lib/creative/winner.ts) share one definition without importing each other.

export const LEARNING_DAYS = 3;
export const LEARNING_SPEND_CENTS = 2000;

const DAY = 86_400_000;

/** Past the learning period, judged on the last week. */
export function pastLearning(c: Pick<CampaignSnapshot, "status" | "liveSince" | "week">, now: Date): boolean {
  return (
    c.status === "ACTIVE" &&
    Math.floor((now.getTime() - c.liveSince.getTime()) / DAY) >= LEARNING_DAYS &&
    (c.week?.spendCents ?? 0) >= LEARNING_SPEND_CENTS
  );
}
