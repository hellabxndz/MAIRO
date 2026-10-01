import { SENSITIVE_AREAS, type PipelineStatus, type Risk, type Urgency } from "@/lib/platform-intelligence/types";

// The safe update pipeline's rules, pure.
//
//   Detected → Analyzed → Proposed → Development → Automated testing →
//   Sandbox / test account → Approved → Production
//
// Knowledge-only, low-risk updates may go Proposed → Approved. Anything that
// touches campaign creation, budget, publishing, permissions, billing,
// optimization, targeting or live campaigns needs automated tests AND a
// sandbox (or recorded test-account) pass. Nothing reaches production while
// a critical Meta test is failing. And production only ever changes MAIRO's
// structured knowledge and registry — never code, never a live campaign.

export type TestEvidence = { at: Date; criticalFailed: number; failed: number; mode: "CONTRACT" | "SANDBOX" | "MANUAL" };

export type GateContext = {
  status: PipelineStatus;
  areas: string[];
  risk: Risk;
  urgency: Urgency;
  hasAnalysis: boolean;
  proposalKind: "knowledge-only" | "registry" | "code" | null;
  /** When the update entered its current status. */
  enteredAt: Date;
  latestContract: TestEvidence | null;
  latestSandbox: TestEvidence | null;
  now: Date;
};

const ORDER: PipelineStatus[] = ["DETECTED", "ANALYZED", "PROPOSED", "DEVELOPMENT", "AUTOMATED_TESTING", "SANDBOX_TESTING", "APPROVED", "PRODUCTION"];
const DAY = 86_400_000;

export function sensitive(areas: string[]): boolean {
  return areas.some((a) => (SENSITIVE_AREAS as string[]).includes(a));
}

/** Knowledge-only, non-breaking, outside every sensitive area: the fast path. */
export function fastTrack(ctx: Pick<GateContext, "areas" | "risk" | "proposalKind">): boolean {
  return ctx.proposalKind === "knowledge-only" && ctx.risk === "NON_BREAKING" && !sensitive(ctx.areas);
}

const contractGreen = (t: TestEvidence | null, since: Date | null, now: Date) => Boolean(t && t.criticalFailed === 0 && (!since || t.at >= since) && now.getTime() - t.at.getTime() <= 7 * DAY);

/** Whether an update may move to `to`, and if not, why not (in an admin's words). */
export function canMove(ctx: GateContext, to: PipelineStatus): { ok: true } | { ok: false; reason: string } {
  const from = ctx.status;
  if (from === to) return { ok: false, reason: "It's already there." };
  if (from === "PRODUCTION") return { ok: false, reason: "It's in production. A follow-up change is a new update." };
  if (to === "DISMISSED") return { ok: true };
  if (from === "DISMISSED") return to === "DETECTED" ? { ok: true } : { ok: false, reason: "Reopen it first." };
  const i = ORDER.indexOf(from);
  const j = ORDER.indexOf(to);
  // Going back is always allowed: a failed test sends it back to development.
  if (j < i) return { ok: true };

  switch (to) {
    case "ANALYZED":
      return ctx.hasAnalysis ? { ok: true } : { ok: false, reason: "Run the analysis first." };
    case "PROPOSED":
      return ctx.proposalKind ? { ok: true } : { ok: false, reason: "There's no integration proposal yet." };
    case "DEVELOPMENT":
      return i >= ORDER.indexOf("PROPOSED") ? { ok: true } : { ok: false, reason: "It needs a proposal first." };
    case "AUTOMATED_TESTING":
      return i >= ORDER.indexOf("PROPOSED") ? { ok: true } : { ok: false, reason: "It needs a proposal first." };
    case "SANDBOX_TESTING":
      if (from !== "AUTOMATED_TESTING") return { ok: false, reason: "Automated tests come first." };
      return contractGreen(ctx.latestContract, ctx.enteredAt, ctx.now) ? { ok: true } : { ok: false, reason: "Run the Meta contract tests (no critical failures) after it entered automated testing." };
    case "APPROVED": {
      if (fastTrack(ctx) && i >= ORDER.indexOf("PROPOSED")) return { ok: true };
      if (sensitive(ctx.areas) || ctx.risk === "BREAKING" || ctx.risk === "POTENTIALLY_BREAKING") {
        if (from !== "SANDBOX_TESTING") return { ok: false, reason: "This touches campaigns, budgets, publishing, permissions, billing, optimization or targeting (or may break something): it needs sandbox or test-account testing first." };
        const s = ctx.latestSandbox;
        return s && s.failed === 0 && s.at >= ctx.enteredAt ? { ok: true } : { ok: false, reason: "Record a passing sandbox or test-account run after it entered sandbox testing." };
      }
      if (from !== "AUTOMATED_TESTING" && from !== "SANDBOX_TESTING") return { ok: false, reason: "It needs automated testing first." };
      return contractGreen(ctx.latestContract, ctx.enteredAt, ctx.now) ? { ok: true } : { ok: false, reason: "The Meta contract tests must pass with no critical failures." };
    }
    case "PRODUCTION":
      if (from !== "APPROVED") return { ok: false, reason: "Only an approved update goes to production." };
      return contractGreen(ctx.latestContract, null, ctx.now) ? { ok: true } : { ok: false, reason: "A critical Meta test is failing (or none ran in the last 7 days). Nothing goes to production until they pass." };
    default:
      return { ok: true };
  }
}

/** The next step an admin would usually take. */
export function nextStep(ctx: GateContext): PipelineStatus | null {
  switch (ctx.status) {
    case "DETECTED":
      return "ANALYZED";
    case "ANALYZED":
      return "PROPOSED";
    case "PROPOSED":
      return fastTrack(ctx) ? "APPROVED" : ctx.proposalKind === "code" ? "DEVELOPMENT" : "AUTOMATED_TESTING";
    case "DEVELOPMENT":
      return "AUTOMATED_TESTING";
    case "AUTOMATED_TESTING":
      return sensitive(ctx.areas) || ctx.risk !== "NON_BREAKING" ? "SANDBOX_TESTING" : "APPROVED";
    case "SANDBOX_TESTING":
      return "APPROVED";
    case "APPROVED":
      return "PRODUCTION";
    default:
      return null;
  }
}
