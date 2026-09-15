"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateMonthlyPlan } from "@/lib/ai/plan";
import { currentMonthKey } from "@/lib/utils/month";
import { activeOrganizationId } from "@/lib/active-org";
import { normalizePhone, normalizeUrl } from "@/lib/campaigns/destination";

const intakeSchema = z.object({
  primaryGoal: z.enum(["LEADS", "SALES", "AWARENESS", "TRAFFIC", "APP_PROMOTION"]),
  monthlyBudget: z.coerce.number().min(100, "Budget must be at least $100/mo"),
  industry: z.string().optional(),
  website: z.string().optional(),
  /**
   * What the business wants a tap on its ads to do. Asked here so no campaign
   * has to guess, and so the campaign form can pre-fill it.
   */
  destinationType: z.enum(["WEBSITE", "PHONE_CALL"]).default("WEBSITE"),
  phone: z.string().optional(),
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
    destinationType: formData.get("destinationType") || "WEBSITE",
    phone: formData.get("phone") || undefined,
    targetAudience: formData.get("targetAudience") || undefined,
    brandVoice: formData.get("brandVoice") || undefined,
    competitors: formData.get("competitors") || undefined,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  }

  const data = parsed.data;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const monthlyBudgetCents = Math.round(data.monthlyBudget * 100);

  // Normalized on the way in, so nothing downstream has to wonder whether a
  // stored value is usable. A number that cannot be dialled or an address that
  // is not a URL is refused here, where the person can see the field they got
  // wrong, rather than weeks later when an ad fails to build.
  const website = data.website?.trim() ? normalizeUrl(data.website) : null;
  if (data.website?.trim() && !website) {
    return { error: "That doesn't look like a web address. Something like yourbusiness.com." };
  }

  const phone = data.phone?.trim() ? normalizePhone(data.phone) : null;
  if (data.phone?.trim() && !phone) {
    return {
      error:
        "That doesn't look like a phone number MAIRO can dial. Include the area code — for example (555) 123-4567.",
    };
  }

  if (data.destinationType === "PHONE_CALL" && !phone) {
    return { error: "Add the number you want your ads to ring." };
  }
  if (data.destinationType === "WEBSITE" && !website) {
    return { error: "Add the web address you want people sent to when they tap your ad." };
  }

  const organization = await db.organization.update({
    where: { id: organizationId },
    data: {
      industry: data.industry,
      website,
      phone,
      defaultDestination: data.destinationType,
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

  redirect("/dashboard/meta?required=1");
}
