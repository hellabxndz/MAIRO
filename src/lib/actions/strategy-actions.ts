"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrg } from "@/lib/active-org";
import { hasActivePlan } from "@/lib/readiness";
import { maybeGoLive } from "@/lib/campaigns/auto-launch";
import { reviseStrategy, strategyFacts, aiAvailable } from "@/lib/ai/strategy";
import {
  CAMPAIGN_TYPE_VALUES,
  PLAN_GOALS,
  PLATFORMS,
  SECTION_LABEL,
  applyEdit,
  applyEdits,
  applySuggestion,
  changedSections,
  describeSection,
  mergeChanges,
  parseRequest,
  patchToEdits,
  reconcile,
  suggestionFor,
  type ManualEdit,
  type PlanChange,
  type SectionKey,
  type StrategyContent,
  type Suggestion,
} from "@/lib/strategy/plan-logic";
import {
  activateIfPaid,
  approve,
  commit,
  createStrategy,
  loadStrategy,
  markRevising,
  planAtVersion,
  readWebsiteForPlan,
  strategyInputFor,
} from "@/lib/strategy/store";
import { draftFromApprovedPlan } from "@/lib/strategy/campaign";

// What the free plan's review screen and the launch journey call.

async function context() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  const active = await activeOrg();
  return { organizationId: active?.id ?? session.user.organizationId, userId: session.user.id ?? null };
}

function refresh() {
  revalidatePath("/plan");
  revalidatePath("/plan/activate");
  revalidatePath("/dashboard/launch");
}

export type PlanUpdate = {
  plan: StrategyContent;
  version: number;
  status: "DRAFT" | "REVISING" | "APPROVED";
  changes: PlanChange[];
  suggestion: Suggestion | null;
  /** Something the business should know that isn't a change, e.g. hooks that still mention the old product. */
  note: string | null;
};

export type PlanActionResult = ({ ok: true } & PlanUpdate) | { ok: true; answer: string } | { ok: false; error: string };

async function purchaseTracking(organizationId: string): Promise<boolean> {
  const input = await strategyInputFor(organizationId);
  return input?.purchaseTracking ?? false;
}

// --- Building the plan -------------------------------------------------------------

export async function readWebsiteForPlanAction(): Promise<{ ok: boolean; note: string | null }> {
  const ctx = await context();
  if (!ctx) return { ok: false, note: "Not signed in." };
  try {
    const r = await readWebsiteForPlan(ctx.organizationId);
    return { ok: true, note: r.note };
  } catch (error) {
    console.error("Plan website read failed:", error);
    return { ok: true, note: "Mairo couldn't read your website just now, so its website advice is general." };
  }
}

export async function generatePlanAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const r = await createStrategy(ctx.organizationId);
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

// --- Ask Mairo ------------------------------------------------------------------------

const CREATIVE: SectionKey[] = ["creativeStrategy", "concepts", "hooks"];

export async function askMairoAction(request: string, expectedVersion: number): Promise<PlanActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const text = request.trim().slice(0, 1000);
  if (text.length < 3) return { ok: false, error: "Tell Mairo what you'd like to change." };
  const loaded = await loadStrategy(ctx.organizationId);
  if (!loaded) return { ok: false, error: "There's no plan yet." };
  if (loaded.row.activatedAt) return { ok: false, error: "Your plan is locked in now that your subscription is active." };
  if (loaded.row.version !== expectedVersion) return { ok: false, error: "Your plan changed in another tab. Reload to see the latest version." };

  const prev = loaded.plan;
  const input = await strategyInputFor(ctx.organizationId);
  const ptx = { purchaseTracking: input?.purchaseTracking ?? false };

  await markRevising(ctx.organizationId, true);
  try {
    const ai = await reviseStrategy(prev, text, input ? strategyFacts(input) : "");

    if (ai.kind === "answer") return { ok: true, answer: ai.reply };

    let plan: StrategyContent;
    let changes: PlanChange[];
    let suggestion: Suggestion | null = null;

    if (ai.kind === "changed") {
      const touched = changedSections(prev, ai.next);
      const primary = touched.map((k) => ({
        section: k,
        previous: describeSection(prev, k),
        updated: describeSection(ai.next, k),
        reason: ai.reasons[k] || "You asked for this.",
        dependent: false,
      }));
      const r = reconcile(prev, ai.next, touched);
      plan = r.plan;
      changes = mergeChanges(prev, plan, [...primary, ...r.dependent]);
      const first = touched.find((k) => ["budget", "platforms", "goal", "campaignType", "audience"].includes(k));
      suggestion = first ? suggestionFor(plan, first, ptx) : null;
    } else {
      // No AI: only the plain requests Mairo can read with certainty.
      const patch = parseRequest(text);
      if (!patch) {
        return {
          ok: false,
          error: aiAvailable()
            ? "Mairo couldn't make that change just now. Try again in a minute, or use the Edit buttons."
            : "Mairo can change the budget, platforms, ages, location, goal, product or offer from a message like “Change my budget to $35/day”. For anything else, use the Edit buttons.",
        };
      }
      const r = applyEdits(prev, patchToEdits(prev, patch), ptx, "You asked for this.");
      if (!r.ok) return r;
      plan = r.plan;
      changes = r.changes;
      suggestion = r.suggestion;
    }

    if (changes.length === 0) return { ok: true, answer: "Your plan already says that — nothing needed changing." };
    const saved = await commit(ctx.organizationId, { expectedVersion, plan, changes, kind: "ai", request: text, requestedBy: "you" });
    if (!saved.ok) return saved;
    refresh();
    return { ok: true, plan, version: saved.version, status: "DRAFT", changes, suggestion, note: null };
  } finally {
    await markRevising(ctx.organizationId, false);
  }
}

// --- Manual edits ----------------------------------------------------------------------

const editSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("budget"), dailyBudget: z.coerce.number() }),
  z.object({ section: z.literal("platforms"), platforms: z.array(z.enum(PLATFORMS)).max(2) }),
  z.object({ section: z.literal("goal"), goal: z.enum(PLAN_GOALS) }),
  z.object({ section: z.literal("campaignType"), campaignType: z.enum(CAMPAIGN_TYPE_VALUES) }),
  z.object({ section: z.literal("product"), product: z.string().max(200) }),
  z.object({ section: z.literal("offer"), offer: z.string().max(200) }),
  z.object({
    section: z.literal("audience"),
    location: z.string().max(120),
    ageMin: z.coerce.number(),
    ageMax: z.coerce.number(),
    interests: z.array(z.string().max(60)).max(10),
  }),
]);

export async function editPlanAction(raw: ManualEdit, expectedVersion: number): Promise<PlanActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const parsed = editSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check that value." };
  const edit = parsed.data as ManualEdit;
  const loaded = await loadStrategy(ctx.organizationId);
  if (!loaded) return { ok: false, error: "There's no plan yet." };
  if (loaded.row.version !== expectedVersion) return { ok: false, error: "Your plan changed in another tab. Reload to see the latest version." };

  const prev = loaded.plan;
  const ptx = { purchaseTracking: await purchaseTracking(ctx.organizationId) };
  const r = applyEdit(prev, edit, ptx);
  if (!r.ok) return r;
  let { plan, changes } = r;
  let note: string | null = null;

  // A new product or offer means the ads' words should follow. Mairo rewrites
  // the creative for it when it can, and says so; otherwise it says it didn't.
  if ((edit.section === "product" || edit.section === "offer") && changes.length > 0) {
    const input = await strategyInputFor(ctx.organizationId);
    const what = edit.section === "product" ? `the product to advertise to "${plan.product}"` : plan.offer ? `the offer to "${plan.offer}"` : "the offer to none";
    const ai = await reviseStrategy(plan, `I changed ${what}. Rewrite the creative strategy, creative concepts and hooks to match. Change nothing else.`, input ? strategyFacts(input) : "");
    if (ai.kind === "changed") {
      const rewritten = { ...plan };
      for (const k of CREATIVE) (rewritten as Record<string, unknown>)[k] = (ai.next as Record<string, unknown>)[k];
      const extra = changedSections(plan, rewritten)
        .filter((k) => CREATIVE.includes(k))
        .map((k) => ({
          section: k,
          previous: describeSection(plan, k),
          updated: describeSection(rewritten, k),
          reason: `Rewritten for the new ${edit.section === "product" ? "product" : "offer"}.`,
          dependent: true,
        }));
      plan = rewritten;
      changes = mergeChanges(prev, plan, [...changes, ...extra]);
    } else {
      note = `Your ${SECTION_LABEL.hooks.toLowerCase()} and creative concepts were written for the previous ${edit.section}. Ask Mairo to rewrite them if you'd like.`;
    }
  }

  if (changes.length === 0) return { ok: true, plan: prev, version: loaded.row.version, status: loaded.row.status, changes: [], suggestion: null, note: null };
  const saved = await commit(ctx.organizationId, { expectedVersion, plan, changes, kind: "edit", requestedBy: "you" });
  if (!saved.ok) return saved;
  refresh();
  return { ok: true, plan, version: saved.version, status: "DRAFT", changes, suggestion: r.suggestion, note };
}

const patchSchema = z.object({
  dailyBudget: z.number().min(5).max(5000).optional(),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(2).optional(),
  goal: z.enum(PLAN_GOALS).optional(),
  campaignType: z.enum(CAMPAIGN_TYPE_VALUES).optional(),
  audience: z.object({ ageMin: z.number().int().min(18).max(65).optional(), ageMax: z.number().int().min(18).max(65).optional() }).optional(),
});

export async function acceptSuggestionAction(rawPatch: unknown, expectedVersion: number): Promise<PlanActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const patch = patchSchema.safeParse(rawPatch);
  if (!patch.success) return { ok: false, error: "That suggestion couldn't be applied." };
  const loaded = await loadStrategy(ctx.organizationId);
  if (!loaded) return { ok: false, error: "There's no plan yet." };
  if (loaded.row.version !== expectedVersion) return { ok: false, error: "Your plan changed in another tab. Reload to see the latest version." };
  const { plan, changes } = applySuggestion(loaded.plan, patch.data);
  const saved = await commit(ctx.organizationId, { expectedVersion, plan, changes, kind: "suggestion", requestedBy: "you", summary: undefined });
  if (!saved.ok) return saved;
  refresh();
  return { ok: true, plan, version: saved.version, status: "DRAFT", changes, suggestion: null, note: null };
}

/** Undoes the change that made `version`, as long as nothing came after it. */
export async function undoChangeAction(version: number): Promise<PlanActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const loaded = await loadStrategy(ctx.organizationId);
  if (!loaded) return { ok: false, error: "There's no plan yet." };
  if (loaded.row.version !== version || version < 1) return { ok: false, error: "Something else changed since — use the version history instead." };
  const before = await planAtVersion(loaded.row.id, version - 1);
  if (!before) return { ok: false, error: "That version couldn't be found." };
  const changes = changedSections(loaded.plan, before).map((k) => ({
    section: k,
    previous: describeSection(loaded.plan, k),
    updated: describeSection(before, k),
    reason: `You undid Revision ${version}.`,
    dependent: false,
  }));
  const saved = await commit(ctx.organizationId, { expectedVersion: version, plan: before, changes, kind: "undo", requestedBy: "you", summary: `Undid Revision ${version}` });
  if (!saved.ok) return saved;
  refresh();
  return { ok: true, plan: before, version: saved.version, status: "DRAFT", changes, suggestion: null, note: null };
}

/** Goes back to an earlier version from the history (as a new revision). */
export async function restoreVersionAction(target: number, expectedVersion: number): Promise<PlanActionResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const loaded = await loadStrategy(ctx.organizationId);
  if (!loaded) return { ok: false, error: "There's no plan yet." };
  const old = await planAtVersion(loaded.row.id, target);
  if (!old) return { ok: false, error: "That version couldn't be found." };
  const label = target === 0 ? "the Original Plan" : `Revision ${target}`;
  const changes = changedSections(loaded.plan, old).map((k) => ({
    section: k,
    previous: describeSection(loaded.plan, k),
    updated: describeSection(old, k),
    reason: `You went back to ${label}.`,
    dependent: false,
  }));
  const saved = await commit(ctx.organizationId, { expectedVersion, plan: old, changes, kind: "undo", requestedBy: "you", summary: `Went back to ${label}` });
  if (!saved.ok) return saved;
  refresh();
  return { ok: true, plan: old, version: saved.version, status: "DRAFT", changes, suggestion: null, note: null };
}

// --- Approving and moving on -------------------------------------------------------------

export async function approvePlanNowAction(expectedVersion: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const r = await approve(ctx.organizationId, expectedVersion);
  if (!r.ok) return r;
  refresh();
  revalidatePath("/dashboard/plan");
  return { ok: true };
}

/** "Get Started With Mairo": subscription first, or straight on when there's nothing to pay. */
export async function getStartedAction(): Promise<void> {
  const ctx = await context();
  if (!ctx) redirect("/sign-in");
  const row = await activateIfPaid(ctx.organizationId);
  if (!row || row.status !== "APPROVED") redirect("/plan");
  redirect(row.activatedAt ? "/dashboard/launch?welcome=1" : "/plan/activate");
}

/** "Turn My Plan Into a Campaign": the approved plan as a Create draft. */
export async function buildFromPlanAction(): Promise<void> {
  const ctx = await context();
  if (!ctx) redirect("/sign-in");
  const row = await activateIfPaid(ctx.organizationId);
  if (!row?.activatedAt) redirect("/plan/activate");
  const draftId = await draftFromApprovedPlan(ctx.organizationId, ctx.userId);
  if (!draftId) redirect("/dashboard/launch");
  redirect(`/dashboard/create/meta?draft=${draftId}`);
}

/** "Launch Campaign": the one press that lets the first campaign spend. */
export async function launchPlanCampaignAction(): Promise<{ ok: true; launched: boolean; message: string | null } | { ok: false; error: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not signed in." };
  const [row, org] = await Promise.all([
    db.strategyPlan.findUnique({ where: { organizationId: ctx.organizationId } }),
    db.organization.findUnique({ where: { id: ctx.organizationId }, select: { subscriptionTier: true, subscriptionStatus: true } }),
  ]);
  if (!row?.campaignId) return { ok: false, error: "The campaign hasn't been built yet." };
  if (!org || !hasActivePlan(org)) return { ok: false, error: "Your subscription isn't active." };
  const owned = await db.mairoCampaign.updateMany({
    where: { id: row.campaignId, organizationId: ctx.organizationId },
    data: { launchApprovedAt: new Date() },
  });
  if (owned.count === 0) return { ok: false, error: "Campaign not found." };

  const outcome = await maybeGoLive(ctx.organizationId, { onlyCampaignId: row.campaignId, approvedByPerson: true });
  if (outcome.launched) {
    await db.strategyPlan.update({ where: { id: row.id }, data: { launchedAt: new Date() } });
  }
  refresh();
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/campaigns");
  return {
    ok: true,
    launched: outcome.launched,
    message: outcome.launched
      ? null
      : outcome.heldBecause ?? "Approved. Meta is still reviewing the ad — Mairo switches it on as soon as the review clears, because you've already said yes.",
  };
}

export async function dismissWelcomeAction(): Promise<void> {
  const ctx = await context();
  if (!ctx) return;
  await db.strategyPlan.updateMany({ where: { organizationId: ctx.organizationId }, data: { welcomedAt: new Date() } });
  revalidatePath("/dashboard");
}
