"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateMonthlyPlan } from "@/lib/ai/plan";
import { currentMonthKey } from "@/lib/utils/month";

const intakeSchema = z.object({
  primaryGoal: z.enum(["LEADS", "SALES", "AWARENESS", "TRAFFIC", "APP_PROMOTION"]),
  monthlyBudget: z.coerce.number().min(100, "Budget must be at least $100/mo"),
  industry: z.string().optional(),
  website: z.string().optional(),
  targetAudience: z.string().optional(),
  brandVoice: z.string().optional(),
  competitors: z.string().optional(),
  notes: z.string().optional(),
});

export type OnboardingState = { error?: string } | undefined;

export async function completeOnboardingAction(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return { error: "You need to be signed in to finish onboarding." };
  }

  const parsed = intakeSchema.safeParse({
    primaryGoal: formData.get("primaryGoal"),
    monthlyBudget: formData.get("monthlyBudget"),
    industry: formData.get("industry") || undefined,
    website: formData.get("website") || undefined,
    targetAudience: formData.get("targetAudience") || undefined,
    brandVoice: formData.get("brandVoice") || undefined,
    competitors: formData.get("competitors") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  }

  const data = parsed.data;
  const organizationId = session.user.organizationId;
  const monthlyBudgetCents = Math.round(data.monthlyBudget * 100);

  const organization = await db.organization.update({
    where: { id: organizationId },
    data: {
      industry: data.industry,
      website: data.website,
    },
  });

  await db.onboardingIntake.upsert({
    where: { organizationId },
    create: {
      organizationId,
      primaryGoal: data.primaryGoal,
      monthlyBudgetCents,
      targetAudience: data.targetAudience,
      brandVoice: data.brandVoice,
      competitors: data.competitors,
      notes: data.notes,
    },
    update: {
      primaryGoal: data.primaryGoal,
      monthlyBudgetCents,
      targetAudience: data.targetAudience,
      brandVoice: data.brandVoice,
      competitors: data.competitors,
      notes: data.notes,
    },
  });

  const month = currentMonthKey();

  try {
    const plan = await generateMonthlyPlan({
      businessName: organization.name,
      industry: data.industry,
      primaryGoal: data.primaryGoal,
      monthlyBudgetCents,
      targetAudience: data.targetAudience,
      brandVoice: data.brandVoice,
      competitors: data.competitors,
      notes: data.notes,
    });

    await db.monthlyPlan.upsert({
      where: { organizationId_month: { organizationId, month } },
      create: {
        organizationId,
        month,
        status: "IN_REVIEW",
        strategySummary: plan.strategySummary,
        budgetAllocationJson: JSON.stringify(plan.budgetAllocation),
        keyMetrics: JSON.stringify(plan.keyMetrics),
      },
      update: {
        status: "IN_REVIEW",
        strategySummary: plan.strategySummary,
        budgetAllocationJson: JSON.stringify(plan.budgetAllocation),
        keyMetrics: JSON.stringify(plan.keyMetrics),
      },
    });
  } catch {
    // AI plan generation can fail (e.g. missing ANTHROPIC_API_KEY in dev). Onboarding
    // still succeeds — a draft plan can be generated later from the dashboard.
    await db.monthlyPlan.upsert({
      where: { organizationId_month: { organizationId, month } },
      create: {
        organizationId,
        month,
        status: "DRAFT",
        strategySummary:
          "Your plan is being put together — check back shortly, or generate it again from the dashboard.",
        budgetAllocationJson: "[]",
        keyMetrics: "[]",
      },
      update: {},
    });
  }

  redirect("/dashboard");
}
