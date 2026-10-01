"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { socialAccess } from "@/lib/social/access";
import { generatePlan, loadStrategy } from "@/lib/social/manager";
import { goalInfo } from "@/lib/social/goals";
import { executionBlock } from "@/lib/billing/execution";
import { instantFromLocal } from "@/lib/campaigns/schedule";
import { mediaLibrary, ownsRefs } from "@/lib/instagram/library";
import { publishPost } from "@/lib/instagram/scheduler";
import { MEDIA_TYPES, NETWORKS, NETWORK_NAME, asNetwork, validatePost, validateWhen, type MediaType, type Network } from "@/lib/instagram/social-logic";

// Scale's Instagram and Facebook Page posting: post now, schedule, or let
// MAIRO plan the week. The two share one queue; each post says which network
// it's for.
//
// Checked here, not only on the page: the plan (Scale), a live subscription,
// and that every picture or video is one this business made or approved in
// MAIRO. Nothing MAIRO suggests is posted until the business approves it.

export type SocialResult = { ok: true; message: string; permalink?: string | null } | { ok: false; error: string };

async function context(): Promise<{ organizationId: string; timeZone: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  // Active Scale, read fresh from the database on every call.
  const access = await socialAccess(organizationId);
  if (!access.ok) return { error: access.message };
  const blocked = await executionBlock(organizationId);
  if (blocked) return { error: blocked };
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  return { organizationId, timeZone: org?.timezone || "America/New_York" };
}

function refresh() {
  revalidatePath("/dashboard/social", "layout");
}

const createSchema = z.object({
  network: z.enum(NETWORKS).default("INSTAGRAM"),
  mediaType: z.enum(MEDIA_TYPES),
  refs: z.array(z.string().max(80)).min(1).max(10),
  caption: z.string().max(2400),
  /** Local wall-clock time in the business's timezone, or null for now. */
  local: z.string().max(20).nullable(),
});

export async function createPostAction(input: z.input<typeof createSchema>): Promise<SocialResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the post." };
  const { network, mediaType, refs, local } = parsed.data;
  const caption = parsed.data.caption.trim();

  const invalid = validatePost({ mediaType, refs, caption, network });
  if (invalid) return { ok: false, error: invalid };
  const when = local ? instantFromLocal(local, ctx.timeZone) : null;
  if (local && !when) return { ok: false, error: "That time isn't valid." };
  const whenProblem = validateWhen(when);
  if (whenProblem) return { ok: false, error: whenProblem };
  if (!(await ownsRefs(ctx.organizationId, refs))) return { ok: false, error: "One of those pictures or videos isn't available to post." };

  const [library, strategy] = await Promise.all([mediaLibrary(ctx.organizationId), loadStrategy(ctx.organizationId)]);
  const preview = library.find((m) => m.ref === refs[0])?.previewUrl ?? null;
  // Every post is shown as it will look on Instagram or Facebook before
  // anything is posted: this creates the preview, and approving it posts.
  await db.instagramPost.create({
    data: {
      organizationId: ctx.organizationId,
      network,
      caption,
      mediaType,
      mediaRefs: refs,
      previewUrl: preview,
      status: "SUGGESTED",
      suggestedByMairo: false,
      scheduledFor: when,
      contentType: "Your post",
      objective: strategy ? goalInfo(strategy.goal).objective : null,
      rationale: "You made this post yourself.",
    },
  });
  refresh();
  return { ok: true, message: `Here's how it will look on your ${network === "FACEBOOK" ? "Page" : "feed"}. Approve it and MAIRO posts it.` };
}

/**
 * Adds Instagram or the Facebook Page to where Social Manager posts. Asked on
 * the network's own page; the goal comes first, in Social Manager.
 */
export async function enableNetworkAction(network: Network): Promise<SocialResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const which = asNetwork(network);
  const strategy = await db.socialStrategy.findUnique({ where: { organizationId: ctx.organizationId }, select: { platforms: true } });
  if (!strategy) return { ok: false, error: "Tell MAIRO what you want your business to accomplish first, in Social Manager." };
  await db.socialStrategy.update({
    where: { organizationId: ctx.organizationId },
    data: { platforms: [...new Set([...strategy.platforms, which])] },
  });
  await db.organization.update({
    where: { id: ctx.organizationId },
    data: which === "FACEBOOK" ? { facebookOptInAt: new Date(), facebookDeclinedAt: null } : { instagramOptInAt: new Date(), instagramDeclinedAt: null },
  });
  refresh();
  return planWeekAction(which);
}

/**
 * MAIRO plans the next week for this network — from the business's goal and
 * strategy, never at random. Nothing is posted until it's approved (or, on
 * Autopilot, within the rules the business already approved).
 */
export async function planWeekAction(networkInput: Network = "INSTAGRAM"): Promise<SocialResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const result = await generatePlan(ctx.organizationId, { network: asNetwork(networkInput), timeoutMs: 45_000 });
  if (result.error) return { ok: false, error: result.error };
  refresh();
  if (result.created === 0) return { ok: true, message: "Your week is already planned. Open the Content Calendar to see it." };
  return {
    ok: true,
    message: `MAIRO planned ${result.created} post${result.created === 1 ? "" : "s"} for your goal${result.drafts ? ` (${result.drafts} still need${result.drafts === 1 ? "s" : ""} a picture or video)` : ""}. Nothing goes out until you approve it.`,
  };
}

/**
 * Approving a previewed post. "now" posts it straight away; "scheduled"
 * posts it at its chosen time (or at once if that time has passed).
 */
export async function approvePostsAction(ids: string[], mode: "now" | "scheduled" = "scheduled"): Promise<SocialResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const clean = z.array(z.string().max(64)).max(20).safeParse(ids);
  if (!clean.success || clean.data.length === 0) return { ok: false, error: "Nothing to approve." };
  const rows = await db.instagramPost.findMany({ where: { id: { in: clean.data }, organizationId: ctx.organizationId, status: "SUGGESTED" } });
  if (rows.length === 0) return { ok: false, error: "That post has already been approved or removed." };
  for (const r of rows) {
    const problem = validatePost({ mediaType: r.mediaType as MediaType, refs: r.mediaRefs, caption: r.caption, network: asNetwork(r.network) });
    if (problem) return { ok: false, error: problem };
  }
  const where = NETWORK_NAME[asNetwork(rows[0].network)];
  const now = new Date();
  for (const r of rows) {
    const when = mode === "now" ? null : r.scheduledFor && r.scheduledFor > now ? r.scheduledFor : null;
    await db.instagramPost.update({ where: { id: r.id }, data: { status: "SCHEDULED", approvedAt: now, scheduledFor: when } });
  }
  refresh();

  if (mode === "scheduled") {
    const later = rows.filter((r) => r.scheduledFor && r.scheduledFor > now);
    return {
      ok: true,
      message: later.length === rows.length
        ? `Approved — MAIRO posts ${rows.length === 1 ? "it" : "them"} at the scheduled time${rows.length === 1 ? "" : "s"}.`
        : `Approved ${rows.length} post${rows.length === 1 ? "" : "s"}.`,
    };
  }

  // Post now: publish each straight away.
  let posted = 0;
  let permalink: string | null | undefined;
  const problems: string[] = [];
  for (const r of rows) {
    const outcome = await publishPost(r.id, { budgetMs: 40_000 });
    if (outcome.status === "PUBLISHED") {
      posted++;
      permalink = outcome.permalink;
    } else if (outcome.status === "FAILED") problems.push(outcome.message);
  }
  refresh();
  if (problems.length && posted === 0) return { ok: false, error: problems[0] };
  const place = where === "Facebook" ? "Facebook Page" : "Instagram";
  if (posted === rows.length) return { ok: true, message: rows.length === 1 ? `Posted to your ${place}.` : `Posted ${posted} posts to your ${place}.`, permalink };
  return { ok: true, message: `${where} is still processing — MAIRO finishes posting at the next check.` };
}

const updateSchema = z.object({ id: z.string().max(64), caption: z.string().max(2400), local: z.string().max(20).nullable() });

export async function updatePostAction(input: z.infer<typeof updateSchema>): Promise<SocialResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the post." };
  const post = await db.instagramPost.findFirst({ where: { id: parsed.data.id, organizationId: ctx.organizationId, status: { in: ["SUGGESTED", "SCHEDULED", "DRAFT"] } } });
  if (!post) return { ok: false, error: "That post can't be changed any more." };
  const caption = parsed.data.caption.trim();
  // A draft has no picture yet; only its words are checked.
  const problem = post.status === "DRAFT"
    ? caption ? null : "The post needs some text."
    : validatePost({ mediaType: post.mediaType as MediaType, refs: post.mediaRefs, caption, network: asNetwork(post.network) });
  if (problem) return { ok: false, error: problem };
  const when = parsed.data.local ? instantFromLocal(parsed.data.local, ctx.timeZone) : null;
  if (parsed.data.local && !when) return { ok: false, error: "That time isn't valid." };
  const whenProblem = validateWhen(when);
  if (whenProblem) return { ok: false, error: whenProblem };
  await db.instagramPost.update({ where: { id: post.id }, data: { caption, scheduledFor: when } });
  refresh();
  return { ok: true, message: "Saved." };
}

export async function discardPostAction(id: string): Promise<SocialResult> {
  const session = await auth();
  if (!session?.user?.organizationId) return { ok: false, error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  // Cancelling is always allowed, whatever the plan. A post MAIRO planned is
  // kept as Skipped, so MAIRO learns what the business doesn't want; the
  // business's own posts are simply removed.
  const post = await db.instagramPost.findFirst({ where: { id, organizationId, status: { in: ["SUGGESTED", "SCHEDULED", "DRAFT", "PAUSED"] } }, select: { id: true, suggestedByMairo: true } });
  if (!post) return { ok: false, error: "That post has already been posted." };
  if (post.suggestedByMairo) await db.instagramPost.update({ where: { id: post.id }, data: { status: "SKIPPED", approvedAt: null } });
  else await db.instagramPost.delete({ where: { id: post.id } });
  refresh();
  return { ok: true, message: post.suggestedByMairo ? "Skipped. MAIRO will take that into account." : "Removed." };
}
