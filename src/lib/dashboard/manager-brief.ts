import { db } from "@/lib/db";
import { statusLabel } from "@/lib/dashboard/campaigns";
import { pixelStateFor, loadPixelSetup } from "@/lib/tracking/pixel-setup";
import { launchGate } from "@/lib/tracking/pixel-rules";

// Where this one business stands, for the MAIRO manager's prompt — the same
// facts the Overview's "Right now" reads, so the assistant and the dashboard
// never give two answers to "what's happening with my ads?".
//
// Database only, scoped to the one organization: no Meta call (figures come
// from the assistant's tools, which read Meta when asked), and no other
// business's rows. Nothing here is estimated.

const FIRST_STEP: Record<string, string> = {
  connect: "waiting for the owner to connect their Meta ad account (the button is on the Launch page)",
  build: "Meta is connected; the campaign is ready to be built from the approved plan",
  review: "built in their ad account, switched off, waiting for the owner's launch approval",
  waiting: "the owner approved the launch; MAIRO switches it on once Meta approves the ad and confirms it can charge the account",
};

export async function managerStatusBrief(organizationId: string, now = new Date()): Promise<string> {
  const [intake, plan, campaigns, approvals, setup] = await Promise.all([
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { primaryGoal: true, monthlyBudgetCents: true } }),
    db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true, activatedAt: true, campaignId: true, launchedAt: true } }),
    db.mairoCampaign.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, objective: true, status: true, endDate: true, launchApprovedAt: true, totalDailyBudgetCents: true, platformCampaigns: { select: { adReviewState: true, lastError: true } } },
    }),
    db.mairoDecision.count({ where: { organizationId, status: "PENDING" } }),
    loadPixelSetup(organizationId).catch(() => null),
  ]);

  const lines: string[] = ["Where this business stands right now (from its records — the same facts its dashboard shows):"];
  if (intake) {
    lines.push(`- Goal given at setup: ${intake.primaryGoal.toLowerCase()}. Monthly ad budget they said they're comfortable with: $${Math.round(intake.monthlyBudgetCents / 100)}.`);
  }
  if (plan?.activatedAt && !plan.launchedAt) {
    const first = plan.campaignId ? campaigns.find((c) => c.id === plan.campaignId) : null;
    const step = !setup?.connected ? "connect" : !first ? "build" : first.launchApprovedAt ? "waiting" : "review";
    lines.push(`- First campaign: ${FIRST_STEP[step]}.`);
  }
  if (campaigns.length === 0) lines.push("- Campaigns: none yet. Nothing has been spent.");
  else {
    lines.push("- Campaigns (status as MAIRO shows it; whether Meta is delivering comes from the tools):");
    for (const c of campaigns) {
      lines.push(`  - ${c.name}: ${statusLabel(c, now).text}; $${Math.round(c.totalDailyBudgetCents / 100)}/day; goal ${c.objective.toLowerCase()}.`);
    }
  }
  lines.push(approvals > 0 ? `- Waiting for the owner's approval: ${approvals} recommendation${approvals === 1 ? "" : "s"} in the Approval Center.` : "- Nothing is waiting for the owner's approval.");
  if (setup?.need === "required_for_purchases") {
    const gate = launchGate("required_for_purchases", await pixelStateFor(organizationId));
    lines.push(
      gate.ok
        ? "- Purchase tracking: verified — Meta has received a Purchase event from the website."
        : `- Purchase tracking: NOT verified (${gate.title}). A purchase campaign won't launch until it is; never say sales are being counted.`,
    );
  }
  lines.push(
    "Launches and budget increases always need the owner's approval in MAIRO; never say one happened without it. For spend, results, cost per result and ROAS, call the tools — if a figure isn't reported, say it's pending or unavailable, never zero.",
  );
  return lines.join("\n");
}
