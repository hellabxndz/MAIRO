"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { deniedFor } from "@/lib/members/authorize";
import { heroVariantCookie, recordOnce } from "@/lib/analytics/funnel";
import { plansFor } from "@/lib/preview/saved-plan-store";
import { draftFromPlan } from "@/lib/preview/saved-plan";
import { setupGoalFor } from "@/lib/preview/strategy";
import type { PreviewGoal } from "@/lib/preview/build";
import { businessTypeFrom } from "@/lib/onboarding/business-types";
import { intakeSchema, writeIntake } from "@/lib/onboarding/intake";
import { approve, createStrategy } from "@/lib/strategy/store";
import { destinationsForStart } from "@/lib/onboarding/quick-start";

// "I like it — get started": the quick start from a free plan the owner liked
// (/plan/start). The plan already holds the website, what they sell, the goal
// and the budget, so setup asks one thing — where a tap on an ad should send
// people — then MAIRO writes the strategy, the owner approves it, and goes on
// to choose a MAIRO plan and connect Meta. Nothing here launches or spends.

export type StartState = { error?: string } | undefined;

async function who(): Promise<{ organizationId: string } | { error: string }> {
  // Setting the business up: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { error: denied };
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Sign in to continue." };
  return { organizationId: (await activeOrganizationId()) ?? session.user.organizationId };
}

/** Step 1: the setup, confirmed from the free plan, and the strategy written from it. */
export async function startFromPlanAction(_prev: StartState, formData: FormData): Promise<StartState> {
  const w = await who();
  if ("error" in w) return { error: w.error };
  const { organizationId } = w;

  const [org, intake, saved] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { parentId: true, industry: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    plansFor(organizationId),
  ]);
  if (!org) return { error: "Sign in to continue." };
  if (!intake) {
    const plan = saved[0]?.plan;
    if (!plan) return { error: "Your free plan wasn't found in this account. Answer the full setup instead." };
    const goal = setupGoalFor(plan.inputs.goal as PreviewGoal);
    const destinationType = String(formData.get("destinationType") ?? "");
    if (!destinationsForStart(goal).some((d) => d.key === destinationType)) return { error: "Choose where a tap on your ad should send people." };
    const website = String(formData.get("website") ?? "").trim() || plan.inputs.website || undefined;
    const notes = draftFromPlan(plan, {}).goal?.notes;
    const parsed = intakeSchema.safeParse({
      primaryGoal: goal,
      monthlyBudget: plan.inputs.monthly,
      industry: org.industry || businessTypeFrom(plan.facts.businessType)?.label || undefined,
      website,
      destinationType,
      messageChannel: formData.get("messageChannel") || "MESSENGER",
      phone: String(formData.get("phone") ?? "").trim() || undefined,
      targetAudience: plan.facts.customer || undefined,
      notes: notes || undefined,
      offering: (plan.facts.offering || plan.inputs.sells).slice(0, 200),
      currentOffer: plan.facts.offer.slice(0, 200) || undefined,
      customerLocation: plan.facts.location.slice(0, 120) || undefined,
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your answers." };
    const r = await writeIntake(organizationId, parsed.data);
    if (!r.ok) return { error: r.error };
    // From here this business needs a subscription before MAIRO executes anything paid.
    if (!r.parentId) await db.organization.update({ where: { id: organizationId }, data: { paymentRequired: true } });
  }

  return written(organizationId);
}

async function written(organizationId: string): Promise<StartState> {
  const s = await createStrategy(organizationId);
  if (!s.ok) return { error: s.error };
  // The primary conversion measure, with the hero version this visitor saw.
  await recordOnce("plan_created", organizationId, { variant: await heroVariantCookie() });
  revalidatePath("/plan/start");
  redirect("/plan/start");
}

/** A strategy that wasn't written the first time (the AI didn't answer): try again. */
export async function writeStrategyAction(): Promise<StartState> {
  const w = await who();
  if ("error" in w) return { error: w.error };
  return written(w.organizationId);
}

/** Step 2: the owner approves the strategy they're shown, then chooses a MAIRO plan. */
export async function approveAndChooseAction(_prev: StartState, formData: FormData): Promise<StartState> {
  const w = await who();
  if ("error" in w) return { error: w.error };
  const version = Number(formData.get("version"));
  if (!Number.isInteger(version)) return { error: "Reload the page and try again." };
  const r = await approve(w.organizationId, version);
  if (!r.ok) return { error: r.error };
  await recordOnce("plan_approved", w.organizationId, { variant: await heroVariantCookie() });
  revalidatePath("/plan");
  revalidatePath("/plan/activate");
  redirect("/plan/activate?skip=1#plans");
}
