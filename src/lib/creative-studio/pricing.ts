import { db } from "@/lib/db";
import type { CreativeStudioActionKind } from "@/generated/prisma/enums";

// What each kind of Studio action costs, in credits.
//
// Same shape as src/lib/plans.ts's PlanConfig fallback: a single database row
// can override every number here without a deploy, and a deployment where
// nobody has ever touched that row still works exactly as the defaults below
// say it should. Unlike PlanConfig there is only one live row rather than one
// per tier — a generation costs the same whether Starter or Scale paid for
// it, because cost tracks what the OpenAI call actually costs to run, not
// which plan is asking. What differs per plan is the MONTHLY ALLOWANCE
// (Entitlements.studio_credits_monthly), which is a different number entirely.

export type CreditCosts = {
  /** One image, gpt-image "medium" quality. */
  standard: number;
  /** One image, "high" quality — visibly better, costs roughly 4x more to make. */
  premium: number;
  /** One natural-language change to an existing image. */
  edit: number;
  /** ONE image inside a "generate N variations" batch — multiply by N yourself. */
  variation: number;
};

const DEFAULT_COSTS: CreditCosts = {
  standard: 5,
  premium: 15,
  edit: 5,
  variation: 4,
};

let cached: { costs: CreditCosts; at: number } | null = null;
const CACHE_MS = 60_000;

/**
 * Reads the live credit costs, database first.
 *
 * Cached for a minute in the server's own memory — not Redis, not anything
 * shared — because this is read on every single generate/edit/variation
 * call and the cost table changes, at most, a few times a year. A minute of
 * staleness on a number an admin just edited is a fine trade for not adding a
 * database round trip to the hot path of every image request.
 */
export async function creditCosts(): Promise<CreditCosts> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.costs;

  const row = await db.creativeCreditPricing.findUnique({ where: { id: "default" } }).catch(() => null);

  const costs: CreditCosts = row
    ? {
        standard: row.standardCost,
        premium: row.premiumCost,
        edit: row.editCost,
        variation: row.variationCost,
      }
    : DEFAULT_COSTS;

  cached = { costs, at: Date.now() };
  return costs;
}

/** The cost of one action, resolved to a single number for the ledger. */
export async function costFor(kind: CreativeStudioActionKind, quality: "standard" | "premium"): Promise<number> {
  const costs = await creditCosts();
  if (kind === "EDIT") return costs.edit;
  if (kind === "VARIATION") return costs.variation;
  if (kind === "UPLOAD") return 0;
  // GENERATE
  return quality === "premium" ? costs.premium : costs.standard;
}
