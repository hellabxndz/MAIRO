import { db } from "@/lib/db";
import type { AgentRole } from "@/generated/prisma/enums";
import type { StepId } from "./progress";

// What the AI team has actually done for this business's setup, from its
// recorded runs — reading the website, writing the plan, choosing the
// audience, drafting ad ideas, building and launching. Nothing here is shown
// unless a run was recorded; a run still going says so only while it really
// is (its record says RUNNING).

export const SETUP_TASKS = ["read-website", "write-plan", "plan-audience", "plan-creative", "revise-plan", "build-campaign", "ad-concept", "launch", "cancel-launch"];

export type SetupWork = { id: string; agent: AgentRole; task: string; status: string; summary: string | null; at: Date };

export async function setupWork(organizationId: string, limit = 8): Promise<SetupWork[]> {
  const runs = await db.agentRun.findMany({
    where: { organizationId, task: { in: SETUP_TASKS } },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: { id: true, agent: true, task: true, status: true, summary: true, startedAt: true, finishedAt: true },
  });
  return runs.map((r) => ({ id: r.id, agent: r.agent, task: r.task, status: r.status, summary: r.summary, at: r.finishedAt ?? r.startedAt }));
}

/**
 * Who takes the next step, said as what will happen — never as something
 * already happening. Shown under "What happens next".
 */
export function nextUp(focus: StepId | null): { agent: AgentRole; text: string } | null {
  switch (focus) {
    case "business":
    case "learn":
      return { agent: "STRATEGIST", text: "MAIRO reads your website (if you have one) to learn what you sell and who buys it." };
    case "goal":
    case "plan":
      return { agent: "STRATEGIST", text: "MAIRO writes your free plan, chooses who it reaches and drafts the first ad ideas." };
    case "edit":
    case "approve":
      return { agent: "STRATEGIST", text: "Ask for any change in your own words and MAIRO rewrites that part of the plan, explaining why." };
    case "connect":
    case "subscribe":
      return { agent: "ARCHITECT", text: "Once Meta is connected and your plan is active, MAIRO builds the campaign in your ad account — switched off." };
    case "prepare":
      return { agent: "ARCHITECT", text: "MAIRO builds it in your ad account, switched off, and its Budget Guardian checks the budget against your limits." };
    case "launch":
      return { agent: "ARCHITECT", text: "After you approve, MAIRO switches it on once Meta has approved the ad, then reads the first results." };
    default:
      return null;
  }
}
