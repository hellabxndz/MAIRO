"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateMonthlyPlan } from "@/lib/ai/plan";
import { currentMonthKey } from "@/lib/utils/month";
import { activeOrganizationId } from "@/lib/active-org";
import { deniedFor } from "@/lib/members/authorize";

export async function regeneratePlanAction() {
  // Role check: business.edit (lib/members/roles.ts).
  if (await deniedFor("business.edit")) return;
  const session = await auth();
  if (!session?.user?.organizationId) throw new Error("Not authenticated");

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const [organization, intake] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    db.onboardingIntake.findUnique({ where: { organizationId } }),
  ]);

  if (!organization || !intake) throw new Error("Complete onboarding first");
  // A business with a MAIRO Advertising Plan has one plan: that one.
  if (await hasAdvertisingPlan(organizationId)) throw new Error("Your advertising plan is the plan. Change it on your plan page.");

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
  // Role check: business.edit (lib/members/roles.ts).
  if (await deniedFor("business.edit")) return;
  const session = await auth();
  if (!session?.user?.organizationId) throw new Error("Not authenticated");

  const organizationId =
    (await activeOrganizationId()) ?? session.user.organizationId;
  if (await hasAdvertisingPlan(organizationId)) throw new Error("Approve your advertising plan on your plan page.");

  await db.monthlyPlan.update({
    where: {
      organizationId_month: {
        organizationId: organizationId,
        month: currentMonthKey(),
      },
    },
    data: { status: "APPROVED" },
  });

  revalidatePath("/dashboard/plan");
  revalidatePath("/dashboard");
}

async function hasAdvertisingPlan(organizationId: string): Promise<boolean> {
  return Boolean(await db.strategyPlan.findUnique({ where: { organizationId }, select: { id: true } }));
}
