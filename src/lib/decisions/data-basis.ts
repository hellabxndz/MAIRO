import type { DecisionConfidence } from "@/generated/prisma/enums";
import type { DecisionDraft } from "./types";

// What a recommendation's numbers rest on, pure (pinned by check-meta-reliability).
//
// A sales campaign to a website is judged by purchases, and Meta only counts
// purchases a working Pixel reports. When MAIRO hasn't verified that Meta is
// receiving purchase events — or last verified it long ago — a recommendation
// built on those figures says so, is held at lower confidence, and is never
// carried out automatically if it would spend more. The customer can still
// approve it; they just see what it rests on.

export type PurchaseData = { state: "verified" | "stale" | "unverified" | "missing"; checkedAt: Date | null };

/** Older than this, a purchase verification is stale. */
export const PURCHASE_FRESH_DAYS = 30;

export function purchaseDataFrom(input: { pixelChosen: boolean; latestPurchaseCheck: { status: string; checkedAt: Date } | null }, now: Date): PurchaseData {
  if (!input.pixelChosen) return { state: "missing", checkedAt: null };
  const c = input.latestPurchaseCheck;
  if (!c || c.status !== "VERIFIED") return { state: "unverified", checkedAt: c?.checkedAt ?? null };
  return now.getTime() - c.checkedAt.getTime() > PURCHASE_FRESH_DAYS * 86_400_000 ? { state: "stale", checkedAt: c.checkedAt } : { state: "verified", checkedAt: c.checkedAt };
}

const LOWER: Record<DecisionConfidence, DecisionConfidence> = { HIGH: "MEDIUM", MEDIUM: "EARLY", EARLY: "EARLY" };

/** Spends more: a budget going up, or money moved onto a campaign. */
export function raisesSpend(d: DecisionDraft): boolean {
  return d.changes.some((c) => c.type === "set-budget" && c.toCents > c.fromCents);
}

export function withDataBasis(
  d: DecisionDraft,
  campaign: { objective: string; destinationType: string } | null,
  purchase: PurchaseData,
): { draft: DecisionDraft; holdAutomatic: boolean } {
  const judgedOnPurchases = campaign?.objective === "SALES" && campaign.destinationType === "WEBSITE";
  if (!judgedOnPurchases || purchase.state === "verified") return { draft: d, holdAutomatic: false };
  const value =
    purchase.state === "missing"
      ? "No Meta Pixel is measuring purchases on your website, so the purchase figures behind this are incomplete."
      : purchase.state === "stale"
        ? `Purchase events were last verified on ${purchase.checkedAt!.toISOString().slice(0, 10)} — over ${PURCHASE_FRESH_DAYS} days ago. Check your Pixel before relying on these figures.`
        : "MAIRO hasn't verified that Meta is receiving purchase events from your website, so treat the purchase figures behind this as unconfirmed.";
  return {
    draft: {
      ...d,
      confidence: LOWER[d.confidence],
      evidence: [...d.evidence, { label: "Data check", value, advancedLabel: "Conversion data" }],
    },
    holdAutomatic: raisesSpend(d),
  };
}
