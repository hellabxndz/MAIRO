import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { gatherDecisionInput } from "@/lib/decisions/gather";
import { decide, costPerResult, clickRate, frequency } from "@/lib/decisions/rules";
import { persistDrafts, parseChanges } from "@/lib/decisions/store";
import { describeChange } from "@/lib/decisions/guardrails";
import { resultsFor, resultWord } from "@/lib/protection/rules";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { activeMission, missionActivity, proposedMission, startMission, tellMairo } from "@/lib/mission/store";
import { MISSION_GOAL_KEYS, missionGoal } from "@/lib/mission/goals";

// What the assistant can look at and propose — One-Click Fix.
//
// Two tools, and the split is the safety:
//
//   diagnose_campaigns reads the account's real figures (the same windows
//   Mairo Decisions uses) and the decisions the rules produce. The assistant
//   explains from these numbers only.
//
//   propose_fix puts a "Fix This For Me" button under the answer, for
//   decisions the rules produced. The assistant can't invent a change: it can
//   only point at one of these, and the customer still approves every change
//   in the confirmation panel. Nothing here changes an account.

function figures(objective: Parameters<typeof resultsFor>[0], m: PlatformMetrics | null) {
  if (!m) return null;
  const ctr = clickRate(m);
  const freq = frequency(m);
  const cpr = costPerResult(objective, m);
  return {
    spend: m.spendCents === null ? null : `$${(m.spendCents / 100).toFixed(2)}`,
    results: resultsFor(objective, m),
    costPerResult: cpr === null ? null : `$${(cpr / 100).toFixed(2)}`,
    clickRatePercent: ctr === null ? null : Number((ctr * 100).toFixed(2)),
    frequency: freq === null ? null : Number(freq.toFixed(2)),
    revenue: m.revenueCents === null ? null : `$${(m.revenueCents / 100).toFixed(2)}`,
    roas: m.roas,
  };
}

export function assistantTools(organizationId: string) {
  return {
    diagnose_campaigns: tool({
      description:
        "Read this business's real campaign figures and MAIRO's current recommended fixes. Use it for any question about performance: why sales or results changed, why costs went up, whether to change a budget, why people click but don't buy. Figures come in three windows: the last 3 days, the 4 days before that, and the last 7 days. Never state a figure that isn't in this result.",
      inputSchema: z.object({
        campaignId: z.string().optional().describe("A MAIRO campaign id, to focus on one campaign"),
      }),
      execute: async ({ campaignId }) => {
        const input = await gatherDecisionInput(organizationId);
        const run = decide(input);
        // Stored like the daily run's, so a proposal can point at them and
        // the Decisions page shows the same thing.
        const ids = await persistDrafts(organizationId, run.decisions, "daily");
        const rows = await db.mairoDecision.findMany({ where: { id: { in: ids } } });
        const campaigns = input.campaigns
          .filter((c) => !campaignId || c.mairoCampaignId === campaignId)
          .map((c) => ({
            id: c.mairoCampaignId,
            name: c.name,
            status: c.status,
            goal: c.objective,
            resultWord: resultWord(c.objective),
            dailyBudget: `$${(c.dailyBudgetCents / 100).toFixed(0)}`,
            last3Days: figures(c.objective, c.recent),
            previous4Days: figures(c.objective, c.prior),
            last7Days: figures(c.objective, c.week),
            ads: c.ads.map((a) => ({
              label: a.label,
              last3Days: figures(c.objective, a.recent),
              previous4Days: figures(c.objective, a.prior),
              last7Days: figures(c.objective, a.week),
            })),
          }));
        return {
          dataStatus: run.dataStatus,
          note:
            run.dataStatus === "learning"
              ? "Campaigns are still in their first days. Say MAIRO needs more campaign data before recommending changes."
              : run.dataStatus === "no-campaigns"
                ? "Nothing is running yet."
                : null,
          campaigns,
          recommendedFixes: rows
            .filter((d) => !campaignId || d.mairoCampaignId === campaignId || d.mairoCampaignId === null)
            .map((d) => ({
              decisionId: d.id,
              title: d.title,
              whatMairoNoticed: d.noticed,
              recommendation: d.recommendation,
              confidence: d.confidence,
              risk: d.risk,
              changes: parseChanges(d.changesJson).map((c) => describeChange(c)),
              canBeAppliedByMairo: parseChanges(d.changesJson).some((c) => c.type !== "guide"),
            })),
        };
      },
    }),

    get_mission: tool({
      description:
        "Read the business's current MAIRO mission (its goal, strategy and what MAIRO is doing) and any plan waiting for approval. Use it whenever the person talks about what they want to achieve, their goal, or what MAIRO is doing.",
      inputSchema: z.object({}),
      execute: async () => {
        const [m, p, doing] = await Promise.all([activeMission(organizationId), proposedMission(organizationId), missionActivity(organizationId)]);
        return {
          current: m ? { goal: missionGoal(m.primaryGoal).label, secondaryGoal: m.secondaryGoal ? missionGoal(m.secondaryGoal).label : null, title: m.title, strategy: m.plan.strategy, why: m.plan.why, focus: m.plan.focus } : null,
          waitingForApproval: p ? { title: p.title, goal: missionGoal(p.primaryGoal).label } : null,
          doing,
        };
      },
    }),

    propose_mission: tool({
      description:
        "Build a new MAIRO plan when the person wants a different outcome (\"I need more customers this month\", \"we want more bookings\") or is launching something. It is saved for them to review and approve on the Mission page; nothing changes until they do. Pass their words; add the goal key only if it is clear. Explain the recommendation briefly, then tell them to review and approve it.",
      inputSchema: z.object({
        request: z.string().min(3).max(800).describe("What they said they want, in their words"),
        goal: z.enum(MISSION_GOAL_KEYS).optional(),
      }),
      execute: async ({ request, goal }) => {
        const r = await startMission(organizationId, { goal: goal ?? null, request });
        if (r.kind === "questions") return { needsAnswers: r.questions.map((q) => q.question), missionId: null };
        const p = await proposedMission(organizationId);
        return { missionId: r.missionId, title: p?.title ?? null, goal: p ? missionGoal(p.primaryGoal).label : null, strategy: p?.plan.strategy ?? null, why: p?.plan.why ?? null, focus: p?.plan.focus ?? [] };
      },
    }),

    tell_mairo: tool({
      description:
        "Record news about the business that should change the marketing: a promotion (\"20% off this weekend\"), something sold out or discontinued (\"we sold out of the blue hoodie\"), or a fact to remember. MAIRO updates its plans (and, on Scale, social posts) and says what it changed. For a new goal or a launch, use propose_mission instead.",
      inputSchema: z.object({ text: z.string().min(3).max(800).describe("What they told you, in their words") }),
      execute: async ({ text }) => {
        const r = await tellMairo(organizationId, text);
        return { result: r.kind, message: r.message, whatMairoChanged: r.actions, missionId: r.missionId ?? null };
      },
    }),

    propose_fix: tool({
      description:
        "Show a 'Fix This For Me' button under your answer for recommended fixes from diagnose_campaigns (only those with canBeAppliedByMairo). The person reviews each change and approves it in a confirmation panel; nothing changes until they do. Call it at most once per answer, after explaining the problem.",
      inputSchema: z.object({
        decisionIds: z.array(z.string()).min(1).max(5),
      }),
      execute: async ({ decisionIds }) => {
        const rows = await db.mairoDecision.findMany({
          where: { id: { in: decisionIds }, organizationId, status: "PENDING" },
        });
        const usable = rows.filter((d) => parseChanges(d.changesJson).some((c) => c.type !== "guide"));
        return {
          decisionIds: usable.map((d) => d.id),
          changes: usable.flatMap((d) => parseChanges(d.changesJson).filter((c) => c.type !== "guide").map((c) => describeChange(c))),
          note: usable.length === 0 ? "None of those can be applied by MAIRO; tell the person what to do instead." : null,
        };
      },
    }),
  };
}

/** Added to the customer assistant's prompt alongside the tools. */
export const MISSION_BRIEF = [
  "MAIRO Mission:",
  "- MAIRO is the business's AI marketing manager. The owner says what they want to achieve; MAIRO decides the marketing.",
  "- When they describe an outcome they want or a launch, call get_mission, then propose_mission with their words. Say what you recommend in one or two sentences (e.g. \"Your current goal is brand awareness. I recommend changing the primary goal to customer acquisition.\"), then tell them the plan is ready to review and approve on the Mission page. Never say it's already changed.",
  "- When they tell you news (a promotion, something sold out, a fact), call tell_mairo and relay what MAIRO changed.",
  "- Social posting is part of the plan only on Scale; don't promise it otherwise. Never promise results.",
].join("\n");

export const ONE_CLICK_FIX_BRIEF = [
  "One-Click Fix:",
  "- For any question about how campaigns are performing, call diagnose_campaigns first and answer from its figures only. Never invent or estimate a number.",
  "- Explain the likely cause in plain words first (e.g. \"people are seeing this ad too often and fewer are clicking it\"), then the supporting figures, then numbered recommended steps.",
  "- If diagnose_campaigns returns recommended fixes MAIRO can apply, call propose_fix with their decisionIds so the person gets a \"Fix This For Me\" button, and tell them they'll see every change before it's made.",
  "- Only MAIRO's own recommended fixes can be proposed. For anything else (their website, a new campaign), say what to do and where.",
  "- If the data status is \"learning\", say MAIRO needs more campaign data before making this recommendation. Never promise results or revenue.",
].join("\n");
