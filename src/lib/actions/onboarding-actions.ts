"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateMonthlyPlan } from "@/lib/ai/plan";
import { currentMonthKey } from "@/lib/utils/month";
import { activeOrganizationId } from "@/lib/active-org";
import { normalizePhone, normalizeUrl, requiredDetailFor } from "@/lib/campaigns/destination";
import { Prisma } from "@/generated/prisma/client";
import { recommendGoal } from "@/lib/onboarding/goal";
import { parseEconomics } from "@/lib/calc/assumptions";
import { CORRECTABLE, businessSchema, goalDraftSchema, learnBusiness, saveBusinessStep, saveGoalDraft, type LearnResult } from "@/lib/onboarding/setup";
import { changeBrain } from "@/lib/brain/store";
import { deniedFor } from "@/lib/members/authorize";

const intakeSchema = z.object({
  primaryGoal: z.enum(["LEADS", "SALES", "AWARENESS", "TRAFFIC", "APP_PROMOTION"]),
  monthlyBudget: z.coerce.number().min(100, "Budget must be at least $100/mo"),
  industry: z.string().optional(),
  website: z.string().optional(),
  /**
   * What the business wants a tap on its ads to do. Asked here so no campaign
   * has to guess, and so the campaign form can pre-fill it.
   *
   * All four, because a business whose goal is leads is asked how it wants them
   * — a call, a form, a message or its own site — and the answer decides
   * whether MAIRO can measure the results without anybody installing tracking.
   */
  destinationType: z
    .enum(["WEBSITE", "PHONE_CALL", "LEAD_FORM", "DIRECT_MESSAGE"])
    .default("WEBSITE"),
  /// Which inbox, when the answer was "they message me". Defaulted rather than
  /// required so the three other answers do not have to send a field they have
  /// no opinion about.
  messageChannel: z.enum(["MESSENGER", "INSTAGRAM", "WHATSAPP"]).default("MESSENGER"),
  phone: z.string().optional(),
  targetAudience: z.string().optional(),
  brandVoice: z.string().optional(),
  competitors: z.string().optional(),
  notes: z.string().optional(),
  offering: z.string().max(200).optional(),
  currentOffer: z.string().max(200).optional(),
  customerLocation: z.string().max(120).optional(),
  serviceReach: z.string().max(60).optional(),
  budgetSuggested: z.enum(["1", "0"]).optional(),
});

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

  // Whether anything is required at all comes from requiredDetailFor, the same
  // answer the form used to decide which field to show. A form or a message
  // needs nothing from the business, which is what makes them the easy start.
  const needs = requiredDetailFor(data.destinationType);
  if (needs === "phone" && !phone) {
    return { error: "Add the number you want your ads to ring." };
  }
  if (needs === "website" && !website) {
    return { error: "Add the web address you want people sent to when they tap your ad." };
  }

  const organization = await db.organization.update({
    where: { id: organizationId },
    data: {
      industry: data.industry,
      website,
      phone,
      defaultDestination: data.destinationType,
      defaultMessageChannel: data.messageChannel,
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
      offering: data.offering?.trim() || null,
      currentOffer: data.currentOffer?.trim() || null,
      customerLocation: data.customerLocation?.trim() || null,
      serviceReach: data.serviceReach?.trim() || null,
      budgetSuggested: data.budgetSuggested === "1",
      economicsJson: economics ? JSON.stringify(economics) : null,
    },
    update: {
      primaryGoal: data.primaryGoal,
      monthlyBudgetCents,
      targetAudience: data.targetAudience,
      brandVoice: data.brandVoice,
      competitors: data.competitors,
      notes: data.notes,
      offering: data.offering?.trim() || null,
      currentOffer: data.currentOffer?.trim() || null,
      customerLocation: data.customerLocation?.trim() || null,
      serviceReach: data.serviceReach?.trim() || null,
      budgetSuggested: data.budgetSuggested === "1",
      economicsJson: economics ? JSON.stringify(economics) : null,
    },
  });

  // What the owner typed is their own word: kept in the Business Brain as
  // confirmed, so their first ads can be written from it straight away.
  await recordOwnerAnswers(organizationId, { offering: data.offering, audience: data.targetAudience, location: data.customerLocation, offer: data.currentOffer });

  // The intake is the record from here on; the half-finished answers are done with.
  await db.organization.update({ where: { id: organizationId }, data: { onboardingDraft: Prisma.DbNull } });

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

/** The owner's onboarding answers, saved to the Business Brain as theirs. "Not sure" isn't an answer. */
async function recordOwnerAnswers(organizationId: string, a: { offering?: string | null; audience?: string | null; location?: string | null; offer?: string | null }) {
  const answers: [string, string | null | undefined, boolean][] = [
    ["focusItem", a.offering, false],
    ["targetCustomer", a.audience, false],
    ["serviceArea", a.location, false],
    ["offers", a.offer, true],
  ];
  for (const [field, raw, list] of answers) {
    const value = (raw ?? "").trim();
    if (!value || /^(not sure|i don.t know|none|n\/a)$/i.test(value)) continue;
    await changeBrain(organizationId, list ? { op: "add", field, value } : { op: "set", field, value }, "customer").catch(() => null);
  }
}

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
