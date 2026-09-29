"use server";

import { executionBlock } from "@/lib/billing/execution";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { analyzeBusiness } from "@/lib/business/analyze";
import { loadBrain, sanitizeProfile, saveBrain, profileSchema, type BrainField } from "@/lib/business/brain";
import { newPlan, type CampaignPlan } from "@/lib/campaigns/plan";
import { supportsDestination } from "@/lib/campaigns/objectives";

async function context() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  return { organizationId, userId: session.user.id ?? null };
}

export type AnalyzeState = { ok?: boolean; error?: string } | undefined;

export async function analyzeBusinessAction(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  const ctx = await context();
  if (!ctx) return { error: "Not signed in." };
  const url = String(formData.get("url") ?? "").trim().slice(0, 500);
  if (!url) return { error: "Paste your website's address first." };
  const result = await analyzeBusiness(ctx.organizationId, url);
  if (!result.ok) return { error: result.error };
  revalidatePath("/dashboard/business");
  revalidatePath("/dashboard/settings/business-brain");
  return { ok: true };
}

export type SaveBrainState = { ok?: boolean; error?: string } | undefined;

/**
 * Saves the Business Brain editor. Any field that differs from what was
 * stored is marked as edited by hand, so a later analysis leaves it alone.
 */
export async function saveBrainAction(input: Record<string, unknown>): Promise<SaveBrainState> {
  const ctx = await context();
  if (!ctx) return { error: "Not signed in." };
  const current = await loadBrain(ctx.organizationId);
  const incoming = sanitizeProfile(input as Partial<Record<BrainField, unknown>>);
  const parsed = profileSchema.safeParse({ ...current.profile, ...incoming });
  if (!parsed.success) return { error: "Some of that couldn't be saved. Check the colours are hex codes like #1a2b3c." };

  const changed = (Object.keys(incoming) as BrainField[]).filter(
    (k) => JSON.stringify(current.profile[k]) !== JSON.stringify(parsed.data[k]),
  );
  await saveBrain(ctx.organizationId, {
    profile: parsed.data,
    editedFields: [...new Set([...current.editedFields, ...changed])],
  });
  revalidatePath("/dashboard/business");
  revalidatePath("/dashboard/settings/business-brain");
  return { ok: true };
}

/**
 * "Build This Campaign": the analysis's recommendation as a saved Create
 * draft, opened at the first step so every answer can be checked before
 * anything is built. Nothing is launched from here.
 */
export async function buildCampaignFromBrainAction(): Promise<void> {
  const ctx = await context();
  if (!ctx) redirect("/sign-in");
  // Building a campaign is paid; a free-plan business chooses a plan first.
  if (await executionBlock(ctx.organizationId)) redirect("/plan/activate");
  const [brain, org] = await Promise.all([
    loadBrain(ctx.organizationId),
    db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true, website: true, defaultMessageChannel: true },
    }),
  ]);
  if (!org) redirect("/sign-in");
  const p = brain.profile;
  const s = brain.analysis?.strategy ?? null;

  const base = newPlan({
    service: "meta",
    businessName: p.businessName || org.name,
    website: p.website || org.website,
    offering: p.overview || null,
    targetAudience: s?.audience || p.targetCustomer || null,
    differentiator: p.usps.join("; ") || null,
    messageChannel: org.defaultMessageChannel,
    timeZone: "",
    metaPercent: 100,
  });
  const website = brain.analyzedUrl || p.website || org.website || "";
  const goal = s?.goal ?? null;
  const plan: CampaignPlan = {
    ...base,
    promotes: s?.promotes ?? null,
    promotesDetail: s?.primaryProduct ?? p.bestProducts[0] ?? "",
    goal,
    destinationType: goal && website && supportsDestination(goal, "WEBSITE") ? "WEBSITE" : null,
    destinationValue: goal && website && supportsDestination(goal, "WEBSITE") ? website : "",
    dailyAmount: s?.budgetPerDayDollars ?? base.dailyAmount,
  };

  const draft = await db.campaignDraft.create({
    data: {
      organizationId: ctx.organizationId,
      createdByUserId: ctx.userId,
      service: "meta",
      step: "business",
      label: (s?.campaignLabel ? `${s.campaignLabel} — ${s.primaryProduct}` : `${p.businessName || org.name} campaign`).slice(0, 120),
      data: JSON.parse(JSON.stringify(plan)),
    },
    select: { id: true },
  });
  redirect(`/dashboard/create/meta?draft=${draft.id}`);
}
