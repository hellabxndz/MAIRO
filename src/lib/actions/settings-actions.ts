"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Everything a client told us about their business, changeable afterwards.
//
// Until this existed the business name was captured once at signup and then
// permanently frozen: onboarding updated the industry and website but never
// the name, and there was no settings screen at all. A typo at signup was
// forever, and a business that renamed itself had no recourse.
//
// That matters more here than in most products, because the name is not just
// a label on the page — it is passed into every creative prompt, so a wrong
// one quietly poisons every ad concept the AI writes from then on.

const businessSchema = z.object({
  name: z.string().trim().min(1, "Your business needs a name").max(120, "That name is too long"),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  website: z.string().trim().max(300).optional().or(z.literal("")),
});

const briefSchema = z.object({
  primaryGoal: z.enum(["LEADS", "SALES", "AWARENESS", "TRAFFIC", "APP_PROMOTION"]),
  monthlyBudget: z.coerce.number().min(100, "Minimum budget is $100 a month"),
  targetAudience: z.string().trim().max(2000).optional().or(z.literal("")),
  brandVoice: z.string().trim().max(2000).optional().or(z.literal("")),
  competitors: z.string().trim().max(2000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type SettingsActionState = { error?: string; saved?: boolean } | undefined;

/** Empty strings mean "cleared", which is a null column rather than "". */
function orNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function updateBusinessAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  const parsed = businessSchema.safeParse({
    name: formData.get("name"),
    industry: formData.get("industry"),
    website: formData.get("website"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  }

  await db.organization.update({
    where: { id: session.user.organizationId },
    data: {
      name: parsed.data.name,
      industry: orNull(parsed.data.industry),
      website: orNull(parsed.data.website),
    },
  });

  // The name is in the dashboard shell on every page, so the whole tree needs
  // to be revalidated rather than just this route.
  revalidatePath("/dashboard", "layout");
  return { saved: true };
}

export async function updateBriefAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not authenticated" };

  const parsed = briefSchema.safeParse({
    primaryGoal: formData.get("primaryGoal"),
    monthlyBudget: formData.get("monthlyBudget"),
    targetAudience: formData.get("targetAudience"),
    brandVoice: formData.get("brandVoice"),
    competitors: formData.get("competitors"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  }

  const organizationId = session.user.organizationId;
  const data = {
    primaryGoal: parsed.data.primaryGoal,
    monthlyBudgetCents: Math.round(parsed.data.monthlyBudget * 100),
    targetAudience: orNull(parsed.data.targetAudience),
    brandVoice: orNull(parsed.data.brandVoice),
    competitors: orNull(parsed.data.competitors),
    notes: orNull(parsed.data.notes),
  };

  // Upserted rather than updated: the dashboard layout sends anyone without an
  // intake back to onboarding, but that is a redirect and not a database
  // constraint, so this must not assume the row exists.
  await db.onboardingIntake.upsert({
    where: { organizationId },
    create: { organizationId, ...data },
    update: data,
  });

  revalidatePath("/dashboard", "layout");
  return { saved: true };
}
