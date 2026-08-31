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

  const { object } = await generateObject({
    model: agentModel,
    schema: planSchema,
    system:
      "You are MyRo's ad strategist AI. You write a first-month Meta ads plan for a " +
      "small business owner. Be specific and realistic for the stated budget — do not " +
      "recommend tactics that require a budget far larger than what's given.",
    prompt: `Business: ${input.businessName}
Industry: ${input.industry ?? "Not specified"}
Primary goal: ${input.primaryGoal}
Monthly ad budget: ${budget}
Target audience: ${input.targetAudience || "Not specified — suggest one"}
Brand voice: ${input.brandVoice || "Not specified — assume friendly and professional"}
Known competitors: ${input.competitors || "None given"}
Additional notes from the business owner: ${input.notes || "None"}

Write this business's first monthly Meta ads plan.`,
  });

  return object;
}
