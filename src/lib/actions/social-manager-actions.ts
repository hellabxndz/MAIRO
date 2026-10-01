"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { executionBlock } from "@/lib/billing/execution";
import { socialAccess } from "@/lib/social/access";
import { resumeSocial } from "@/lib/social/pause";
import { mediaLibrary, ownsRefs } from "@/lib/instagram/library";
import { MEDIA_TYPES, NETWORKS, validatePost, type MediaType, type Network } from "@/lib/instagram/social-logic";
import {
  APPROVAL_MODES,
  AUTOPILOT_MIN_APPROVED,
  GOAL_KEYS,
  PROMOTION_FIELDS,
  PROMOTION_KEYS,
  missingPromotionFields,
  type PromotionKind,
} from "@/lib/social/goals";
import { approveWeek, autopilotReady, generatePlan, goalNeedsDetails, savePromotion, setGoal } from "@/lib/social/manager";

// MAIRO Social Manager actions. Scale only: every action that creates,
// plans, schedules or turns on automation checks active Scale on the server
// first (lib/social/access.ts). Nothing here trusts the page that called it.

export type ManagerResult = { ok: true; message: string; created?: number } | { ok: false; error: string };

async function scaleOnly(): Promise<{ organizationId: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const access = await socialAccess(organizationId);
  if (!access.ok) return { error: access.message };
  const blocked = await executionBlock(organizationId);
  if (blocked) return { error: blocked };
  return { organizationId };
}

function refresh() {
  revalidatePath("/dashboard/social", "layout");
  revalidatePath("/dashboard");
}

const detailsSchema = z.record(z.string().max(40), z.string().max(1500));

const goalSchema = z.object({
  goal: z.enum(GOAL_KEYS),
  goalDetail: z.string().max(1000).default(""),
  platforms: z.array(z.enum(NETWORKS)).min(1, "Choose Instagram, Facebook or both.").max(2),
  postsPerWeek: z.number().int().min(2).max(7).default(4),
  details: detailsSchema.optional(),
});

/** Step one of Social Manager: what the business wants to accomplish. */
export async function setGoalAction(input: z.input<typeof goalSchema>): Promise<ManagerResult> {
  const ctx = await scaleOnly();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your answers." };
  const { goal, goalDetail, platforms, postsPerWeek, details } = parsed.data;

  // A launch, sale or event needs its details before MAIRO can plan it.
  const kind = goalNeedsDetails(goal);
  let promotion: { kind: PromotionKind; details: Record<string, string> } | null = null;
  if (kind) {
    const clean = cleanDetails(kind, details ?? {});
    const missing = missingPromotionFields(kind, clean);
    if (missing.length) return { ok: false, error: `Please add: ${missing.join(", ")}.` };
    promotion = { kind, details: clean };
  }

  const result = await setGoal(ctx.organizationId, { goal, goalDetail: goalDetail.trim(), platforms, postsPerWeek, promotion });
  refresh();
  return { ok: true, message: result.ai ? "MAIRO built your strategy." : "MAIRO built your strategy from its playbook (AI isn't available right now, so captions will be plainer)." };
}

function cleanDetails(kind: PromotionKind, details: Record<string, string>): Record<string, string> {
  const allowed = new Set(PROMOTION_FIELDS[kind].map((f) => f.key));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(details)) {
    if (!allowed.has(k)) continue;
    const value = v.trim();
    if (!value) continue;
    if ((k === "start" || k === "end") && !/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    out[k] = value;
  }
  if (out.start && out.end && out.end < out.start) delete out.end;
  return out;
}

const planSchema = z.object({ offsetDays: z.number().int().min(0).max(28).default(0), network: z.enum(NETWORKS).optional() });

/** Plans one week of the calendar. "Plan the month" calls this four times. */
export async function planAction(input: z.input<typeof planSchema> = {}): Promise<ManagerResult> {
  const ctx = await scaleOnly();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That isn't a week MAIRO can plan." };
  const result = await generatePlan(ctx.organizationId, { offsetDays: parsed.data.offsetDays, network: parsed.data.network as Network | undefined, timeoutMs: 45_000 });
  if (result.error) return { ok: false, error: result.error };
  refresh();
  if (result.created === 0) return { ok: true, message: "That week is already planned.", created: 0 };
  return {
    ok: true,
    created: result.created,
    message: `MAIRO planned ${result.created} post${result.created === 1 ? "" : "s"}${result.drafts ? `; ${result.drafts} need${result.drafts === 1 ? "s" : ""} a picture or video from you` : ""}.`,
  };
}

const promotionSchema = z.object({ kind: z.enum(PROMOTION_KEYS), details: detailsSchema });

/** "Anything happening at your business?" — MAIRO markets it. */
export async function addPromotionAction(input: z.input<typeof promotionSchema>): Promise<ManagerResult> {
  const ctx = await scaleOnly();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = promotionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the details." };
  const strategy = await db.socialStrategy.findUnique({ where: { organizationId: ctx.organizationId }, select: { id: true } });
  if (!strategy) return { ok: false, error: "Tell MAIRO your goal first, then add what's happening." };
  const details = cleanDetails(parsed.data.kind, parsed.data.details);
  const missing = missingPromotionFields(parsed.data.kind, details);
  if (missing.length) return { ok: false, error: `Please add: ${missing.join(", ")}.` };
  const promo = await savePromotion(ctx.organizationId, parsed.data.kind, details);
  // Plan the first week around it now; later weeks are planned as they come.
  const result = await generatePlan(ctx.organizationId, { timeoutMs: 45_000 });
  refresh();
  return {
    ok: true,
    created: result.created,
    message: `MAIRO added "${promo.title}" and planned ${result.created} post${result.created === 1 ? "" : "s"} around it, mixed with useful posts so your feed doesn't turn into ads.`,
  };
}

/** Stops marketing a promotion. Posts not yet out are skipped. */
export async function endPromotionAction(id: string): Promise<ManagerResult> {
  const session = await auth();
  if (!session?.user?.organizationId) return { ok: false, error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  const promo = await db.socialPromotion.findFirst({ where: { id, organizationId } });
  if (!promo) return { ok: false, error: "That promotion isn't there any more." };
  await db.socialPromotion.update({ where: { id }, data: { status: "CANCELLED" } });
  await db.instagramPost.updateMany({ where: { promotionId: id, status: { in: ["SUGGESTED", "DRAFT", "SCHEDULED", "PAUSED"] } }, data: { status: "SKIPPED", approvedAt: null } });
  refresh();
  return { ok: true, message: `"${promo.title}" stopped. Its posts that hadn't gone out were skipped.` };
}

const modeSchema = z.enum(APPROVAL_MODES.map((m) => m.key) as [string, ...string[]]);

export async function setApprovalModeAction(mode: string): Promise<ManagerResult> {
  const ctx = await scaleOnly();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = modeSchema.safeParse(mode);
  if (!parsed.success) return { ok: false, error: "That isn't an approval setting." };
  if (parsed.data === "AUTOPILOT") {
    const ready = await autopilotReady(ctx.organizationId);
    if (!ready.ok) {
      return {
        ok: false,
        error: `Approve at least ${AUTOPILOT_MIN_APPROVED} posts yourself first (you've approved ${ready.approved}), so Autopilot follows what you've already said yes to.`,
      };
    }
  }
  const updated = await db.socialStrategy.updateMany({ where: { organizationId: ctx.organizationId }, data: { approvalMode: parsed.data } });
  if (!updated.count) return { ok: false, error: "Tell MAIRO your goal first." };
  refresh();
  const label = APPROVAL_MODES.find((m) => m.key === parsed.data)!.label;
  return { ok: true, message: `${label} is on.` };
}

const settingsSchema = z.object({ platforms: z.array(z.enum(NETWORKS)).min(1).max(2), postsPerWeek: z.number().int().min(2).max(7) });

export async function updateSocialSettingsAction(input: z.input<typeof settingsSchema>): Promise<ManagerResult> {
  const ctx = await scaleOnly();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose at least one place to post, and 2 to 7 posts a week." };
  const updated = await db.socialStrategy.updateMany({ where: { organizationId: ctx.organizationId }, data: parsed.data });
  if (!updated.count) return { ok: false, error: "Tell MAIRO your goal first." };
  refresh();
  return { ok: true, message: "Saved." };
}

/** Weekly approval: one click approves the coming week. */
export async function approveWeekAction(): Promise<ManagerResult> {
  const ctx = await scaleOnly();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const count = await approveWeek(ctx.organizationId);
  refresh();
  return count
    ? { ok: true, message: `Approved ${count} post${count === 1 ? "" : "s"}. MAIRO posts each one at its time.` }
    : { ok: false, error: "Nothing in the next week is ready to approve. Posts still needing a picture stay as drafts." };
}

const attachSchema = z.object({ id: z.string().max(64), mediaType: z.enum(MEDIA_TYPES), refs: z.array(z.string().max(80)).min(1).max(10) });

/** Gives a draft its picture or video, so it can be approved. */
export async function attachMediaAction(input: z.input<typeof attachSchema>): Promise<ManagerResult> {
  const ctx = await scaleOnly();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a picture or video." };
  const post = await db.instagramPost.findFirst({ where: { id: parsed.data.id, organizationId: ctx.organizationId, status: { in: ["DRAFT", "SUGGESTED"] } } });
  if (!post) return { ok: false, error: "That post can't be changed any more." };
  const problem = validatePost({ mediaType: parsed.data.mediaType as MediaType, refs: parsed.data.refs, caption: post.caption, network: post.network === "FACEBOOK" ? "FACEBOOK" : "INSTAGRAM" });
  if (problem) return { ok: false, error: problem };
  if (!(await ownsRefs(ctx.organizationId, parsed.data.refs))) return { ok: false, error: "That picture or video isn't available." };
  const preview = (await mediaLibrary(ctx.organizationId)).find((m) => m.ref === parsed.data.refs[0])?.previewUrl ?? null;
  await db.instagramPost.update({
    where: { id: post.id },
    data: { mediaType: parsed.data.mediaType, mediaRefs: parsed.data.refs, previewUrl: preview, status: "SUGGESTED", creativeIdea: null },
  });
  refresh();
  return { ok: true, message: "Added. Approve it when you're happy with how it looks." };
}

/** Back on active Scale: resume what was paused. Nothing past its time goes out late. */
export async function resumeSocialAction(): Promise<ManagerResult> {
  const ctx = await scaleOnly();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { rescheduled, needApproval } = await resumeSocial(ctx.organizationId);
  refresh();
  return {
    ok: true,
    message: `Social Manager is back on.${rescheduled ? ` ${rescheduled} post${rescheduled === 1 ? " goes" : "s go"} out at ${rescheduled === 1 ? "its" : "their"} scheduled time.` : ""}${
      needApproval ? ` ${needApproval} post${needApproval === 1 ? "" : "s"} missed ${needApproval === 1 ? "its" : "their"} time and need${needApproval === 1 ? "s" : ""} your approval again.` : ""
    }`,
  };
}
