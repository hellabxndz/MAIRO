import { generateObject } from "ai";
import { z } from "zod";
import { agentModel } from "@/lib/ai/model";
import type { AdGoal } from "@/generated/prisma/enums";

const planSchema = z.object({
  strategySummary: z
    .string()
    .describe(
      "A 3-5 sentence narrative explaining the month's ad strategy in plain language, written for a business owner with no ads experience."
    ),
  budgetAllocation: z
    .array(
      z.object({
        channel: z.string().describe("e.g. 'Facebook Feed', 'Instagram Reels', 'Audience Network'"),
        percent: z.number().min(0).max(100),
        rationale: z.string().describe("One sentence on why this channel gets this share."),
      })
    )
    .describe("Should sum to roughly 100 percent."),
  keyMetrics: z
    .array(
      z.object({
        metric: z.string().describe("e.g. 'Cost per lead', 'Click-through rate'"),
        target: z.string().describe("e.g. 'Under $25', '1.5% or higher'"),
      })
    )
    .max(4),
});

export type GeneratedPlan = z.infer<typeof planSchema>;

export type PlanInput = {
  businessName: string;
  industry?: string | null;
  primaryGoal: AdGoal;
  monthlyBudgetCents: number;
  targetAudience?: string | null;
  brandVoice?: string | null;
  competitors?: string | null;
  notes?: string | null;
};

export async function generateMonthlyPlan(input: PlanInput): Promise<GeneratedPlan> {
  const budget = (input.monthlyBudgetCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  const dailyBudget = input.monthlyBudgetCents / 100 / 30;

  const { object } = await generateObject({
    model: agentModel,
    schema: planSchema,
    system:
      "You are MAIRO's ad strategist AI. You write a first-month Meta ads plan for a " +
      "small business owner. Be specific and realistic for the stated budget — do not " +
      "recommend tactics that require a budget far larger than what's given.\n\n" +
      "Be honest about what the budget can do rather than overselling. Meta ad sets " +
      "generally need roughly $10-20/day to get through the learning phase at a " +
      "reasonable pace. Below that, results build slowly and the right move is a " +
      "single tightly-targeted ad set rather than splitting spend across several. " +
      "If the budget is thin, say so plainly in the strategy summary and set " +
      "expectations for a slower ramp — a business owner who knows it's a slow build " +
      "will stay; one who expected instant leads will churn.",
    prompt: `Business: ${input.businessName}
Industry: ${input.industry ?? "Not specified"}
Primary goal: ${input.primaryGoal}
Monthly ad budget: ${budget} (about $${dailyBudget.toFixed(2)}/day)
Target audience: ${input.targetAudience || "Not specified — suggest one"}
Brand voice: ${input.brandVoice || "Not specified — assume friendly and professional"}
Known competitors: ${input.competitors || "None given"}
Additional notes from the business owner: ${input.notes || "None"}

Write this business's first monthly Meta ads plan.`,
  });

  return object;
}
