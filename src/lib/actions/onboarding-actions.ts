"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateMonthlyPlan } from "@/lib/ai/plan";
import { currentMonthKey } from "@/lib/utils/month";
import { activeOrganizationId } from "@/lib/active-org";
import { recommendGoal } from "@/lib/onboarding/goal";
import { intakeSchema, writeIntake } from "@/lib/onboarding/intake";
import { parseEconomics } from "@/lib/calc/assumptions";
import { CORRECTABLE, businessSchema, goalDraftSchema, learnBusiness, saveBusinessStep, saveGoalDraft, type LearnResult } from "@/lib/onboarding/setup";
import { changeBrain } from "@/lib/brain/store";
import { deniedFor } from "@/lib/members/authorize";

export type OnboardingState = { error?: string } | undefined;

export async function completeOnboardingAction(
  _prevState: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { error: denied };
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
    messageChannel: formData.get("messageChannel") || "MESSENGER",
    phone: formData.get("phone") || undefined,
    targetAudience: formData.get("targetAudience") || undefined,
    brandVoice: formData.get("brandVoice") || undefined,
    competitors: formData.get("competitors") || undefined,
    notes: formData.get("notes") || undefined,
    offering: formData.get("offering") || undefined,
    currentOffer: formData.get("currentOffer") || undefined,
    customerLocation: formData.get("customerLocation") || undefined,
    serviceReach: formData.get("serviceReach") || undefined,
    budgetSuggested: formData.get("budgetSuggested") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  }

  const data = parsed.data;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  // Calculator numbers the owner chose to use. Ones that don't add up are refused, not repaired.
  const economicsRaw = formData.get("economics");
  const economics = typeof economicsRaw === "string" && economicsRaw ? parseEconomics(economicsRaw) : null;
  if (economicsRaw && !economics) return { error: "Those calculator numbers don't add up. Remove them, or run the calculator again." };
  const monthlyBudgetCents = Math.round(data.monthlyBudget * 100);

  const w = await writeIntake(organizationId, data, economics);
  if (!w.ok) return { error: w.error };
  const organization = { name: w.organization.name, parentId: w.parentId };

  // A business signing itself up gets the free plan next: MAIRO writes it,
  // they review, change and approve it, and only then choose a subscription.
  // A freelancer's client keeps the old path — its freelancer already pays.
  // A lead form's questions are asked after activation, from the launch checklist.
  // From here this business needs a subscription before MAIRO executes
  // anything paid: the free plan shows what MAIRO would do, paying makes it do it.
  if (!organization.parentId) {
    await db.organization.update({ where: { id: organizationId }, data: { paymentRequired: true } });
    redirect("/plan");
  }

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

  // Where onboarding lets go of somebody.
  //
  // Everyone used to land on the Meta connection, including the people who had
  // just answered "they fill in a form" — and the form's questions live on a
  // screen they had no reason to look for, behind a nav entry that only appears
  // once a form exists. So the one answer that creates more to decide was the
  // one answer that led nowhere.
  //
  // Now it leads to the questions, and that screen hands them on to Meta after.
  if (data.destinationType === "LEAD_FORM") {
    redirect("/dashboard/leads?setup=1");
  }
  redirect("/dashboard/meta?required=1");
}

// --- The setup screens (lib/onboarding/setup.ts does the work) -----------------------

async function orgId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  return (await activeOrganizationId()) ?? session.user.organizationId;
}

export type { Learned } from "@/lib/onboarding/setup";

export async function saveBusinessStepAction(input: z.input<typeof businessSchema>): Promise<{ ok: true; website: string | null } | { ok: false; error: string }> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { ok: false, error: denied };
  const organizationId = await orgId();
  if (!organizationId) return { ok: false, error: "You need to be signed in." };
  return saveBusinessStep(organizationId, input);
}

export async function learnBusinessAction(): Promise<LearnResult> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) throw new Error(denied);
  const organizationId = await orgId();
  if (!organizationId) return { ok: true, read: false, learned: [], unknown: [], pagesRead: [], note: "You need to be signed in.", suggestion: recommendGoal({}) };
  return learnBusiness(organizationId);
}

export async function saveGoalDraftAction(input: z.input<typeof goalDraftSchema>): Promise<{ ok: boolean }> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { ok: false };
  const organizationId = await orgId();
  if (!organizationId) return { ok: false };
  return saveGoalDraft(organizationId, input);
}

/**
 * The owner correcting, confirming or removing something MAIRO read on their
 * website, from the setup screen. Saved to Business Brain as the owner's word,
 * so a later re-read of the website never overwrites it.
 */
export async function correctLearnedAction(input: { field: string; op: "set" | "remove" | "confirm"; value?: string }): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { ok: false, error: denied };
  const organizationId = await orgId();
  if (!organizationId) return { ok: false, error: "You need to be signed in." };
  if (!(CORRECTABLE as readonly string[]).includes(input.field)) return { ok: false, error: "That one is corrected in Business Brain." };
  const value = (input.value ?? "").trim().slice(0, 300);
  if (input.op === "set" && !value) return { ok: false, error: "Type what it should say, or press Remove." };
  const change = input.op === "set" ? { op: "set" as const, field: input.field, value } : input.op === "remove" ? { op: "remove" as const, field: input.field } : { op: "confirm" as const, field: input.field };
  const r = await changeBrain(organizationId, change, "customer").catch(() => ({ ok: false as const, error: "MAIRO couldn't save that just now. Try again." }));
  return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error };
}
