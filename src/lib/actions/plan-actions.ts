"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateMonthlyPlan } from "@/lib/ai/plan";
import { currentMonthKey } from "@/lib/utils/month";

export async function regeneratePlanAction() {
  const session = await auth();
  if (!session?.user?.organizationId) throw new Error("Not authenticated");

  const organizationId = session.user.organizationId;
  const [organization, intake] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    db.onboardingIntake.findUnique({ where: { organizationId } }),
  ]);

  if (!organization || !intake) throw new Error("Complete onboarding first");

  const plan = await generateMonthlyPlan({
    businessName: organization.name,
    industry: organization.industry,
    primaryGoal: intake.primaryGoal,
    monthlyBudgetCents: intake.monthlyBudgetCents,
    targetAudience: intake.targetAudience,
    brandVoice: intake.brandVoice,
    competitors: intake.competitors,
    notes: intake.notes,
  });

  const month = currentMonthKey();

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

  revalidatePath("/dashboard/plan");
  revalidatePath("/dashboard");
}

export async function approvePlanAction() {
  const session = await auth();
  if (!session?.user?.organizationId) throw new Error("Not authenticated");

  await db.monthlyPlan.update({
    where: {
      organizationId_month: {
        organizationId: session.user.organizationId,
        month: currentMonthKey(),
      },
    },
    data: { status: "APPROVED" },
  });

  revalidatePath("/dashboard/plan");
  revalidatePath("/dashboard");
}
