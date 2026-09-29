"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { can } from "@/lib/entitlements";
import { planFor } from "@/lib/plans";
import { executionBlock } from "@/lib/billing/execution";
import { brainBrief, loadBrain } from "@/lib/business/brain";
import { describeStart, instantFromLocal, wallClockInZone } from "@/lib/campaigns/schedule";
import { writeCaptions } from "@/lib/ai/social-captions";
import { mediaLibrary, ownsRefs } from "@/lib/instagram/library";
import { publishPost } from "@/lib/instagram/scheduler";
import { MEDIA_TYPES, planSlots, validatePost, validateWhen, type MediaType } from "@/lib/instagram/social-logic";

// Scale's Instagram posting: post now, schedule, or let MAIRO plan the week.
//
// Checked here, not only on the page: the plan (Scale), a live subscription,
// and that every picture or video is one this business made or approved in
// MAIRO. Nothing MAIRO suggests is posted until the business approves it.

export type SocialResult = { ok: true; message: string; permalink?: string | null } | { ok: false; error: string };

async function context(): Promise<{ organizationId: string; timeZone: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.organizationId) return { error: "Not signed in." };
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  if (!(await can(organizationId, "social_posting"))) {
    return { error: `MAIRO posting to Instagram comes with ${planFor("SCALE").name}. Choose it in Billing and it opens up straight away.` };
  }
  const blocked = await executionBlock(organizationId);
  if (blocked) return { error: blocked };
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  return { organizationId, timeZone: org?.timezone || "America/New_York" };
}

function refresh() {
  revalidatePath("/dashboard/social");
}

const createSchema = z.object({
  mediaType: z.enum(MEDIA_TYPES),
  refs: z.array(z.string().max(80)).min(1).max(10),
  caption: z.string().max(2400),
  /** Local wall-clock time in the business's timezone, or null for now. */
  local: z.string().max(20).nullable(),
});

export async function createPostAction(input: z.infer<typeof createSchema>): Promise<SocialResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the post." };
  const { mediaType, refs, local } = parsed.data;
  const caption = parsed.data.caption.trim();

  const invalid = validatePost({ mediaType, refs, caption });
  if (invalid) return { ok: false, error: invalid };
  const when = local ? instantFromLocal(local, ctx.timeZone) : null;
  if (local && !when) return { ok: false, error: "That time isn't valid." };
  const whenProblem = validateWhen(when);
  if (whenProblem) return { ok: false, error: whenProblem };
  if (!(await ownsRefs(ctx.organizationId, refs))) return { ok: false, error: "One of those pictures or videos isn't available to post." };

  const preview = (await mediaLibrary(ctx.organizationId)).find((m) => m.ref === refs[0])?.previewUrl ?? null;
  const post = await db.instagramPost.create({
    data: {
      organizationId: ctx.organizationId,
      caption,
      mediaType,
      mediaRefs: refs,
      previewUrl: preview,
      status: "SCHEDULED",
      scheduledFor: when,
      approvedAt: new Date(),
    },
  });
  refresh();

  if (when) {
    return { ok: true, message: `Scheduled for ${describeStart(when, ctx.timeZone)}.` };
  }
  const outcome = await publishPost(post.id, { budgetMs: 40_000 });
  refresh();
  if (outcome.status === "PUBLISHED") return { ok: true, message: outcome.message, permalink: outcome.permalink };
  if (outcome.status === "FAILED") return { ok: false, error: outcome.message };
  return { ok: true, message: "Instagram is still processing it — MAIRO publishes it at the next check." };
}

/** MAIRO plans the next week: three posts with captions, for the business to approve. */
export async function planWeekAction(): Promise<SocialResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };

  const [library, brain, recent] = await Promise.all([
    mediaLibrary(ctx.organizationId),
    loadBrain(ctx.organizationId),
    db.instagramPost.findMany({ where: { organizationId: ctx.organizationId, status: { not: "FAILED" } }, orderBy: { createdAt: "desc" }, take: 30, select: { mediaRefs: true } }),
  ]);
  if (library.length === 0) return { ok: false, error: "There's nothing to post yet. Make or approve a picture first, in Creative Studio or Creatives." };

  // Least recently used first, so the week isn't three posts of the same thing.
  const used = new Set(recent.flatMap((r) => r.mediaRefs));
  const fresh = library.filter((m) => !used.has(m.ref));
  const pool = [...fresh, ...library.filter((m) => used.has(m.ref))];
  const images = pool.filter((m) => m.kind === "image");
  const video = pool.find((m) => m.kind === "video");

  type Draft = { mediaType: MediaType; refs: string[]; label: string; existing: string; preview: string | null };
  const drafts: Draft[] = [];
  if (images[0]) drafts.push({ mediaType: "IMAGE", refs: [images[0].ref], label: images[0].label, existing: images[0].suggested, preview: images[0].previewUrl });
  if (images.length >= 4) {
    const set = images.slice(1, 4);
    drafts.push({ mediaType: "CAROUSEL", refs: set.map((i) => i.ref), label: set.map((i) => i.label).join("; "), existing: set[0].suggested, preview: set[0].previewUrl });
  } else if (images[1]) {
    drafts.push({ mediaType: "IMAGE", refs: [images[1].ref], label: images[1].label, existing: images[1].suggested, preview: images[1].previewUrl });
  }
  if (video) drafts.push({ mediaType: "REEL", refs: [video.ref], label: video.label, existing: video.suggested, preview: video.previewUrl });
  else if (images[images.length >= 4 ? 4 : 2]) {
    const i = images[images.length >= 4 ? 4 : 2];
    drafts.push({ mediaType: "IMAGE", refs: [i.ref], label: i.label, existing: i.suggested, preview: i.previewUrl });
  }

  const { captions } = await writeCaptions({
    brief: brainBrief(brain.profile),
    items: drafts.map((d) => ({ kind: d.mediaType === "REEL" ? "Reel (video)" : d.mediaType === "CAROUSEL" ? "carousel of pictures" : "photo", label: d.label, existing: d.existing })),
  });

  const today = wallClockInZone(new Date(), ctx.timeZone).slice(0, 10);
  const slots = planSlots(drafts.length, /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10), 11);

  // A new plan replaces suggestions that were never approved.
  await db.instagramPost.deleteMany({ where: { organizationId: ctx.organizationId, status: "SUGGESTED" } });
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    await db.instagramPost.create({
      data: {
        organizationId: ctx.organizationId,
        caption: (captions[i] || d.existing || d.label).slice(0, 2200),
        mediaType: d.mediaType,
        mediaRefs: d.refs,
        previewUrl: d.preview,
        status: "SUGGESTED",
        suggestedByMairo: true,
        scheduledFor: instantFromLocal(slots[i], ctx.timeZone),
      },
    });
  }
  refresh();
  return { ok: true, message: `MAIRO planned ${drafts.length} post${drafts.length === 1 ? "" : "s"}. Nothing goes out until you approve ${drafts.length === 1 ? "it" : "them"}.` };
}

export async function approvePostsAction(ids: string[]): Promise<SocialResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const clean = z.array(z.string().max(64)).max(20).safeParse(ids);
  if (!clean.success || clean.data.length === 0) return { ok: false, error: "Nothing to approve." };
  const rows = await db.instagramPost.findMany({ where: { id: { in: clean.data }, organizationId: ctx.organizationId, status: "SUGGESTED" } });
  for (const r of rows) {
    const problem = validatePost({ mediaType: r.mediaType as MediaType, refs: r.mediaRefs, caption: r.caption });
    if (problem) return { ok: false, error: problem };
  }
  const now = new Date();
  for (const r of rows) {
    // A suggested time that has passed means "as soon as possible".
    const when = r.scheduledFor && r.scheduledFor > now ? r.scheduledFor : null;
    await db.instagramPost.update({ where: { id: r.id }, data: { status: "SCHEDULED", approvedAt: now, scheduledFor: when } });
  }
  refresh();
  return { ok: true, message: `Approved ${rows.length} post${rows.length === 1 ? "" : "s"}.` };
}

const updateSchema = z.object({ id: z.string().max(64), caption: z.string().max(2400), local: z.string().max(20).nullable() });

export async function updatePostAction(input: z.infer<typeof updateSchema>): Promise<SocialResult> {
  const ctx = await context();
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the post." };
  const post = await db.instagramPost.findFirst({ where: { id: parsed.data.id, organizationId: ctx.organizationId, status: { in: ["SUGGESTED", "SCHEDULED"] } } });
  if (!post) return { ok: false, error: "That post can't be changed any more." };
  const caption = parsed.data.caption.trim();
  const problem = validatePost({ mediaType: post.mediaType as MediaType, refs: post.mediaRefs, caption });
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
  // Cancelling is always allowed, whatever the plan.
  const gone = await db.instagramPost.deleteMany({ where: { id, organizationId, status: { in: ["SUGGESTED", "SCHEDULED", "DRAFT"] } } });
  refresh();
  return gone.count ? { ok: true, message: "Removed." } : { ok: false, error: "That post has already gone to Instagram." };
}
