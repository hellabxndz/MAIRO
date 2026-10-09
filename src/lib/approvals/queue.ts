import { db } from "@/lib/db";
import type { AgentRole } from "@/generated/prisma/enums";
import { usd } from "@/lib/protection/rules";
import { socialAccess } from "@/lib/social/access";

// Everything waiting for the business's say-so, beyond the recommended
// changes on the Approval Center's main list: campaigns built and waiting to
// launch, a plan or mission to approve, Performance Coach plans, and social
// posts ready to publish. Each says who on the AI team it's from, what it does
// to spending and what has to authorize it. Scoped to one organization.

export type OtherApproval = {
  key: string;
  kind: "launch" | "plan" | "mission" | "coach" | "post";
  agent: AgentRole;
  title: string;
  text: string;
  budget: string;
  authorization: string;
  href: string;
  /** For a launch: approved here, with the budget shown. */
  launch: { campaignId: string; budget: string } | null;
};

const DAY = 86_400_000;

export async function otherApprovals(organizationId: string, now = new Date()): Promise<OtherApproval[]> {
  const [launches, plan, mission, coach, social] = await Promise.all([
    db.mairoCampaign.findMany({
      where: { organizationId, launchApprovedAt: null, status: { not: "ARCHIVED" }, platformCampaigns: { some: { status: "PENDING_REVIEW", externalCampaignId: { not: null } } } },
      select: { id: true, name: true, totalDailyBudgetCents: true, budgetType: true, lifetimeBudgetCents: true },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    db.strategyPlan.findUnique({ where: { organizationId }, select: { status: true } }),
    db.marketingMission.findFirst({ where: { organizationId, status: "PROPOSED" }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } }),
    db.coachFinding.findMany({ where: { organizationId, status: "OPEN", severity: { in: ["ATTENTION", "OPPORTUNITY"] } }, orderBy: [{ priority: "desc" }, { firstSeenAt: "asc" }], take: 5, select: { id: true, title: true, plain: true, agentsJson: true } }),
    socialAccess(organizationId).catch(() => ({ ok: false })),
  ]);
  const posts = social.ok
    ? await db.instagramPost.count({ where: { organizationId, status: "SUGGESTED", scheduledFor: { gte: now, lte: new Date(now.getTime() + 14 * DAY) } } })
    : 0;

  const out: OtherApproval[] = [];
  for (const c of launches) {
    const budget = c.budgetType === "LIFETIME" && c.lifetimeBudgetCents ? `Up to ${usd(c.lifetimeBudgetCents)} in total` : `${usd(c.totalDailyBudgetCents)} a day`;
    out.push({
      key: `launch-${c.id}`,
      kind: "launch",
      agent: "ARCHITECT",
      title: `Launch “${c.name}”`,
      text: "Built on Meta and switched off. It starts spending only after you approve, once Meta has approved the ads.",
      budget: `Starts spending: ${budget}.`,
      authorization: "Your explicit approval. A campaign never goes live without it.",
      href: `/dashboard/campaigns/${c.id}`,
      launch: { campaignId: c.id, budget },
    });
  }
  if (plan && plan.status !== "APPROVED") {
    out.push({ key: "plan", kind: "plan", agent: "STRATEGIST", title: "Your advertising plan is ready", text: "Read it, ask for changes, then approve it.", budget: "Nothing is spent by approving a plan.", authorization: "Your approval.", href: "/plan", launch: null });
  }
  if (mission) {
    out.push({ key: `mission-${mission.id}`, kind: "mission", agent: "STRATEGIST", title: `New plan: ${mission.title}`, text: "Your Strategy Agent proposed a new mission for your advertising.", budget: "Nothing is spent by approving a plan.", authorization: "Your approval.", href: "/dashboard/mission", launch: null });
  }
  for (const f of coach) {
    let agent: AgentRole = "ANALYST";
    try {
      const a = JSON.parse(f.agentsJson) as AgentRole[];
      if (a[0]) agent = a[0];
    } catch {}
    out.push({ key: `coach-${f.id}`, kind: "coach", agent, title: f.title, text: f.plain, budget: "Approving the plan changes nothing on Meta.", authorization: "Your approval. Any campaign change in it waits for its own approval.", href: `/dashboard/coach#${f.id}`, launch: null });
  }
  if (posts > 0) {
    out.push({ key: "posts", kind: "post", agent: "CREATIVE", title: `${posts} social post${posts === 1 ? "" : "s"} ready to approve`, text: "Posts MAIRO prepared for your Instagram and Facebook. Nothing publishes until you approve it.", budget: "Organic posts — no ad spend.", authorization: "Your approval, post by post.", href: "/dashboard/social/posts?view=approval", launch: null });
  }
  return out;
}
