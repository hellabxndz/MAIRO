import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { normalizePhone, normalizeUrl, requiredDetailFor } from "@/lib/campaigns/destination";
import { changeBrain } from "@/lib/brain/store";
import type { parseEconomics } from "@/lib/calc/assumptions";

// The business's setup answers, written as its intake: by the full setup
// (completeOnboardingAction) and by the quick start from a free plan the owner
// liked (/plan/start). One place, so both save exactly the same record. Plain
// module, not a server action: callers check who is asking first.

export const intakeSchema = z.object({
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


export type IntakeData = z.infer<typeof intakeSchema>;

/** Saves the answers. Refuses a phone or address MAIRO can't use, with the reason. */
export async function writeIntake(
  organizationId: string,
  data: IntakeData,
  economics: ReturnType<typeof parseEconomics> | null = null,
): Promise<{ ok: true; parentId: string | null; monthlyBudgetCents: number; organization: { name: string } } | { ok: false; error: string }> {
  const monthlyBudgetCents = Math.round(data.monthlyBudget * 100);

  // Normalized on the way in, so nothing downstream has to wonder whether a
  // stored value is usable. A number that cannot be dialled or an address that
  // is not a URL is refused here, where the person can see the field they got
  // wrong, rather than weeks later when an ad fails to build.
  const website = data.website?.trim() ? normalizeUrl(data.website) : null;
  if (data.website?.trim() && !website) {
    return { ok: false, error: "That doesn't look like a web address. Something like yourbusiness.com." };
  }

  const phone = data.phone?.trim() ? normalizePhone(data.phone) : null;
  if (data.phone?.trim() && !phone) {
    return {
      ok: false,
      error:
        "That doesn't look like a phone number MAIRO can dial. Include the area code — for example (555) 123-4567.",
    };
  }

  // Whether anything is required at all comes from requiredDetailFor, the same
  // answer the form used to decide which field to show. A form or a message
  // needs nothing from the business, which is what makes them the easy start.
  const needs = requiredDetailFor(data.destinationType);
  if (needs === "phone" && !phone) {
    return { ok: false, error: "Add the number you want your ads to ring." };
  }
  if (needs === "website" && !website) {
    return { ok: false, error: "Add the web address you want people sent to when they tap your ad." };
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

  return { ok: true, parentId: organization.parentId, monthlyBudgetCents, organization: { name: organization.name } };
}

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

