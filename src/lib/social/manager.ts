import { db } from "@/lib/db";
import { objectiveFor } from "@/lib/mission/goals";
import { loadBrain } from "@/lib/business/brain";
import { metaGraphRequest } from "@/lib/meta/client";
import { loadMetaConnection } from "@/lib/meta/connection";
import { mediaLibrary } from "@/lib/instagram/library";
import { notify } from "@/lib/notifications/notify";
import { instantFromLocal, wallClockInZone } from "@/lib/campaigns/schedule";
import type { Network } from "@/lib/instagram/social-logic";
import { socialAccess } from "./access";
import {
  AUTOPILOT_MIN_APPROVED,
  GOAL_PROMOTION,
  adjustMix,
  goalInfo,
  learningsFrom,
  planSchedule,
  promotionSequence,
  promotionTitle,
  type ApprovalMode,
  type GoalKey,
  type Learnings,
  type PromotionDetails,
  type PromotionKind,
} from "./goals";
import { buildStrategy, strategyMix, strategySchema, writePosts, type PostSlot, type Strategy } from "./strategist";

// Social Manager's working parts, on the server. Every entry point that
// creates, schedules or publishes is reached only through actions that have
// already checked active Scale (lib/actions/social-manager-actions.ts), and
// the publisher checks again before every post.

const DAY = 86_400_000;

export type StrategyView = {
  goal: GoalKey;
  goalDetail: string;
  platforms: Network[];
  approvalMode: ApprovalMode;
  postsPerWeek: number;
  strategy: Strategy;
  aiUsed: boolean;
  pausedAt: Date | null;
  updatedAt: Date;
};

export async function loadStrategy(organizationId: string): Promise<StrategyView | null> {
  const row = await db.socialStrategy.findUnique({ where: { organizationId } });
  if (!row) return null;
  let strategy: Strategy;
  try {
    const parsed = JSON.parse(row.strategyJson) as Strategy;
    strategySchema.parse(parsed);
    strategy = parsed;
  } catch {
    return null;
  }
  return {
    goal: row.goal as GoalKey,
    goalDetail: row.goalDetail,
    platforms: row.platforms.filter((p): p is Network => p === "INSTAGRAM" || p === "FACEBOOK"),
    approvalMode: (["APPROVAL_REQUIRED", "WEEKLY", "AUTOPILOT"].includes(row.approvalMode) ? row.approvalMode : "APPROVAL_REQUIRED") as ApprovalMode,
    postsPerWeek: row.postsPerWeek,
    strategy,
    aiUsed: row.aiUsed,
    pausedAt: row.pausedAt,
    updatedAt: row.updatedAt,
  };
}

async function zoneOf(organizationId: string): Promise<string> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  return org?.timezone || "America/New_York";
}

export function localDate(instant: Date, zone: string): string {
  const s = wallClockInZone(instant, zone).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : instant.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY).toISOString().slice(0, 10);
}

/** What MAIRO has learned from this business's own posts. */
export async function socialLearnings(organizationId: string): Promise<Learnings> {
  const rows = await db.instagramPost.findMany({
    where: { organizationId, contentType: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { contentType: true, objective: true, status: true, likeCount: true, commentCount: true },
  });
  return learningsFrom(rows);
}

/**
 * Saves the business's goal and builds the strategy around it. A launch,
 * sale or event goal also records what's happening as a promotion.
 */
export async function setGoal(
  organizationId: string,
  input: { goal: GoalKey; goalDetail: string; platforms: Network[]; postsPerWeek: number; promotion?: { kind: PromotionKind; details: PromotionDetails } | null },
): Promise<{ strategy: Strategy; ai: boolean; promotionId: string | null }> {
  const [brain, learnings] = await Promise.all([loadBrain(organizationId), socialLearnings(organizationId)]);
  const { strategy, ai } = await buildStrategy({
    profile: brain.profile,
    goal: input.goal,
    goalDetail: input.goalDetail,
    learnings: learnings.notes,
    promotion: input.promotion ?? null,
  });
  const data = {
    goal: input.goal,
    goalDetail: input.goalDetail,
    platforms: input.platforms,
    postsPerWeek: input.postsPerWeek,
    strategyJson: JSON.stringify(strategy),
    aiUsed: ai,
    pausedAt: null,
    pausedReason: null,
  };
  await db.socialStrategy.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data });
  const now = new Date();
  await db.organization.update({
    where: { id: organizationId },
    data: {
      ...(input.platforms.includes("INSTAGRAM") ? { instagramOptInAt: now, instagramDeclinedAt: null } : {}),
      ...(input.platforms.includes("FACEBOOK") ? { facebookOptInAt: now, facebookDeclinedAt: null } : {}),
    },
  });
  const promotionId = input.promotion ? (await savePromotion(organizationId, input.promotion.kind, input.promotion.details)).id : null;
  return { strategy, ai, promotionId };
}

function dateOrNull(value: string | undefined, zone: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return instantFromLocal(`${value}T12:00`, zone);
}

export async function savePromotion(organizationId: string, kind: PromotionKind, details: PromotionDetails) {
  const zone = await zoneOf(organizationId);
  return db.socialPromotion.create({
    data: {
      organizationId,
      kind,
      title: promotionTitle(kind, details),
      detailsJson: JSON.stringify(details),
      startsAt: dateOrNull(details.start, zone),
      endsAt: dateOrNull(details.end, zone),
    },
  });
}

/** Whether a goal needs launch / sale / event details first. */
export function goalNeedsDetails(goal: GoalKey): PromotionKind | null {
  return GOAL_PROMOTION[goal] ?? null;
}

/**
 * Plans posts for a week of the calendar, starting `offsetDays` after
 * tomorrow: promotion steps on their dates, the strategy's content mix on the
 * other posting days. Days that already have a post are left alone, so
 * planning again never doubles up — except that a promotion step takes the
 * place of an unapproved MAIRO suggestion on its day.
 */
export async function generatePlan(
  organizationId: string,
  opts: { offsetDays?: number; days?: number; network?: Network; timeoutMs?: number; now?: Date } = {},
): Promise<{ created: number; drafts: number; ai: boolean; error?: string }> {
  const view = await loadStrategy(organizationId);
  if (!view) return { created: 0, drafts: 0, ai: false, error: "Tell MAIRO your goal first." };
  const platforms = opts.network ? view.platforms.filter((p) => p === opts.network) : view.platforms;
  if (platforms.length === 0) return { created: 0, drafts: 0, ai: false, error: "Choose where MAIRO should post first." };

  const zone = await zoneOf(organizationId);
  const now = opts.now ?? new Date();
  const today = localDate(now, zone);
  const start = addDays(today, 1 + (opts.offsetDays ?? 0));
  const days = opts.days ?? 7;
  const end = addDays(start, days - 1);
  const windowFrom = instantFromLocal(`${start}T00:00`, zone) ?? new Date(now.getTime() + DAY);
  const windowTo = instantFromLocal(`${addDays(end, 1)}T00:00`, zone) ?? new Date(windowFrom.getTime() + days * DAY);

  const [promotions, existing, brain, library, learnings, unavailable] = await Promise.all([
    db.socialPromotion.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } }),
    db.instagramPost.findMany({
      where: { organizationId, scheduledFor: { gte: windowFrom, lt: windowTo }, status: { notIn: ["FAILED"] } },
      select: { id: true, scheduledFor: true, status: true, suggestedByMairo: true, promotionId: true, sequenceStep: true },
    }),
    loadBrain(organizationId),
    mediaLibrary(organizationId),
    socialLearnings(organizationId),
    db.missionNote.findMany({ where: { organizationId, kind: "UNAVAILABLE", active: true }, select: { text: true } }),
  ]);
  // Sold out or discontinued: never planned into a post.
  const avoid = unavailable.map((u) => `Do not promote ${u.text}: the business said it's unavailable.`);
  const unavailableWords = unavailable.map((u) => u.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const usable = library.filter((m) => !unavailableWords.some((ws) => ws.length > 0 && ws.every((w) => m.label.toLowerCase().includes(w))));
  const allPromoPosts = await db.instagramPost.findMany({
    where: { organizationId, promotionId: { in: promotions.map((p) => p.id) } },
    select: { promotionId: true, sequenceStep: true },
  });

  const promoSteps = promotions.map((p) => {
    const details = JSON.parse(p.detailsJson) as PromotionDetails;
    return {
      id: p.id,
      kind: p.kind as PromotionKind,
      title: p.title,
      details,
      steps: promotionSequence(p.kind as PromotionKind, {
        start: p.startsAt ? localDate(p.startsAt, zone) : today,
        end: p.endsAt ? localDate(p.endsAt, zone) : null,
        today: addDays(today, 1),
      }),
    };
  });

  // A promotion step replaces an unapproved MAIRO suggestion on the same day.
  const promoDates = new Set(promoSteps.flatMap((p) => p.steps.map((s) => s.date)));
  const replaceable = existing.filter(
    (e) => e.scheduledFor && promoDates.has(localDate(e.scheduledFor, zone)) && e.suggestedByMairo && !e.promotionId && ["SUGGESTED", "DRAFT"].includes(e.status),
  );
  if (replaceable.length) await db.instagramPost.deleteMany({ where: { id: { in: replaceable.map((r) => r.id) } } });
  const gone = new Set(replaceable.map((r) => r.id));
  const taken = existing.filter((e) => !gone.has(e.id) && e.status !== "SKIPPED" && e.scheduledFor).map((e) => localDate(e.scheduledFor!, zone));

  const pastCount = await db.instagramPost.count({ where: { organizationId, suggestedByMairo: true } });
  const slots = planSchedule({
    start,
    days,
    postsPerWeek: view.postsPerWeek,
    mix: adjustMix(strategyMix(view.strategy), learnings),
    promotions: promoSteps.map((p) => ({ id: p.id, steps: p.steps })),
    taken,
    done: allPromoPosts.map((p) => `${p.promotionId}:${p.sequenceStep}`),
    mixOffset: pastCount,
  });
  if (slots.length === 0) return { created: 0, drafts: 0, ai: false };

  const times = view.strategy.bestTimes.length ? view.strategy.bestTimes : ["11:00"];
  const postSlots: PostSlot[] = slots.map((sl, i) => {
    const promo = sl.promotionId ? promoSteps.find((p) => p.id === sl.promotionId) : null;
    // Reels lead on Instagram; otherwise the networks take turns.
    const platform: Network = platforms.length === 1 ? platforms[0] : sl.format === "REEL" ? "INSTAGRAM" : platforms[i % platforms.length];
    return {
      date: sl.date,
      time: sl.step === "Last chance" || sl.step === "Today" ? "09:00" : times[i % times.length],
      platform,
      contentType: sl.contentType,
      purpose: sl.purpose,
      promotional: sl.promotional,
      format: sl.format,
      step: sl.step,
      promotion: promo ? { id: promo.id, kind: promo.kind, title: promo.title, details: promo.details } : null,
    };
  });

  const { posts, ai } = await writePosts({
    profile: brain.profile,
    strategy: view.strategy,
    goalDetail: view.goalDetail,
    slots: postSlots,
    library: usable,
    learnings: [...learnings.notes, ...avoid],
    timeoutMs: opts.timeoutMs,
  });

  const access = await socialAccess(organizationId);
  const autopilot = view.approvalMode === "AUTOPILOT" && access.ok && !view.pausedAt;
  const objective = goalInfo(view.strategy.goal).objective;
  let created = 0;
  let drafts = 0;
  for (let i = 0; i < postSlots.length; i++) {
    const slot = postSlots[i];
    const post = posts[i];
    const when = instantFromLocal(`${slot.date}T${slot.time}`, zone);
    if (!when || when <= now) continue;
    const hasMedia = post.mediaRefs.length > 0;
    const preview = hasMedia ? library.find((m) => m.ref === post.mediaRefs[0])?.previewUrl ?? null : null;
    await db.instagramPost.create({
      data: {
        organizationId,
        network: slot.platform,
        caption: post.caption,
        cta: post.cta,
        mediaType: post.format,
        mediaRefs: post.mediaRefs,
        previewUrl: preview,
        status: !hasMedia ? "DRAFT" : autopilot ? "SCHEDULED" : "SUGGESTED",
        approvedAt: hasMedia && autopilot ? new Date() : null,
        autoApproved: hasMedia && autopilot,
        suggestedByMairo: true,
        scheduledFor: when,
        contentType: slot.contentType,
        objective: slot.promotion ? `${objective} · ${slot.promotion.title}` : objective,
        marketingObjective: objectiveFor({ contentType: slot.contentType, promotional: slot.promotional, step: slot.step, goal: view.strategy.goal }),
        rationale: post.why,
        creativeIdea: post.creativeIdea,
        promotionId: slot.promotion?.id ?? null,
        sequenceStep: slot.step ?? null,
      },
    });
    created++;
    if (!hasMedia) drafts++;
  }
  return { created, drafts, ai };
}

/** Weekly approval: approves every ready post in the next seven days. */
export async function approveWeek(organizationId: string, now = new Date()): Promise<number> {
  const until = new Date(now.getTime() + 8 * DAY);
  const rows = await db.instagramPost.findMany({
    where: { organizationId, status: "SUGGESTED", scheduledFor: { gt: now, lte: until } },
    select: { id: true, mediaRefs: true },
  });
  const ready = rows.filter((r) => r.mediaRefs.length > 0).map((r) => r.id);
  if (ready.length) await db.instagramPost.updateMany({ where: { id: { in: ready } }, data: { status: "SCHEDULED", approvedAt: now } });
  return ready.length;
}

/** Autopilot needs the business to have approved posts itself first. */
export async function autopilotReady(organizationId: string): Promise<{ ok: boolean; approved: number }> {
  const approved = await db.instagramPost.count({ where: { organizationId, approvedAt: { not: null }, autoApproved: false } });
  return { ok: approved >= AUTOPILOT_MIN_APPROVED, approved };
}

// --- Results -------------------------------------------------------------------

/**
 * Reads likes and comments back for recently published posts. Reach and
 * impressions need Meta's insights permissions, which MAIRO doesn't ask
 * for, so they aren't shown or guessed.
 */
export async function refreshMetrics(organizationId: string, opts: { limit?: number; budgetMs?: number } = {}): Promise<number> {
  const deadline = Date.now() + (opts.budgetMs ?? 8_000);
  const stale = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const rows = await db.instagramPost.findMany({
    where: {
      organizationId,
      status: "PUBLISHED",
      mediaId: { not: null },
      postedAt: { gte: new Date(Date.now() - 60 * DAY) },
      OR: [{ metricsAt: null }, { metricsAt: { lt: stale } }],
    },
    orderBy: { postedAt: "desc" },
    take: opts.limit ?? 10,
    select: { id: true, mediaId: true, network: true },
  });
  if (rows.length === 0) return 0;
  const connection = await loadMetaConnection(organizationId);
  if (!connection) return 0;
  let pageToken: string | null = null;
  let updated = 0;
  for (const r of rows) {
    if (Date.now() > deadline) break;
    try {
      if (r.network === "FACEBOOK") {
        if (!pageToken && connection.pageId) {
          pageToken = (await metaGraphRequest<{ access_token?: string }>(`/${connection.pageId}`, { accessToken: connection.accessToken, params: { fields: "access_token" } })).access_token ?? null;
        }
        if (!pageToken) continue;
        const id = r.mediaId!.replace(/^fb:/, "");
        const res = await metaGraphRequest<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }>(`/${id}`, {
          accessToken: pageToken,
          params: { fields: "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)" },
        });
        await db.instagramPost.update({ where: { id: r.id }, data: { likeCount: res.reactions?.summary?.total_count ?? 0, commentCount: res.comments?.summary?.total_count ?? 0, metricsAt: new Date() } });
      } else {
        const res = await metaGraphRequest<{ like_count?: number; comments_count?: number }>(`/${r.mediaId}`, { accessToken: connection.accessToken, params: { fields: "like_count,comments_count" } });
        await db.instagramPost.update({ where: { id: r.id }, data: { likeCount: res.like_count ?? 0, commentCount: res.comments_count ?? 0, metricsAt: new Date() } });
      }
      updated++;
    } catch (error) {
      console.error("Social metrics read failed:", r.id, error);
      await db.instagramPost.update({ where: { id: r.id }, data: { metricsAt: new Date() } });
    }
  }
  return updated;
}

// --- Weekly approval and Autopilot, on their own -------------------------------

/**
 * Daily: for businesses on Weekly approval or Autopilot, plans the coming
 * week when it's thin. Weekly approval waits for the business to approve
 * it; Autopilot schedules it. Only for active Scale, never while paused.
 */
export async function socialAutopilotRun(opts: { budgetMs?: number; now?: Date } = {}): Promise<{ planned: number }> {
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);
  const now = opts.now ?? new Date();
  const rows = await db.socialStrategy.findMany({
    where: { approvalMode: { in: ["WEEKLY", "AUTOPILOT"] }, pausedAt: null },
    select: { organizationId: true, approvalMode: true, postsPerWeek: true },
    orderBy: { updatedAt: "asc" },
    take: 20,
  });
  let planned = 0;
  for (const r of rows) {
    const left = deadline - Date.now();
    if (left < 8_000) break;
    if (!(await socialAccess(r.organizationId)).ok) continue;
    const upcoming = await db.instagramPost.count({
      where: { organizationId: r.organizationId, scheduledFor: { gt: now, lte: new Date(now.getTime() + 8 * DAY) }, status: { notIn: ["SKIPPED", "FAILED"] } },
    });
    if (upcoming >= Math.ceil(r.postsPerWeek / 2)) continue;
    const result = await generatePlan(r.organizationId, { now, timeoutMs: Math.max(5_000, Math.min(left - 4_000, 30_000)) });
    if (!result.created) continue;
    planned++;
    const week = localDate(now, "UTC");
    await notify({
      organizationId: r.organizationId,
      kind: "CREATIVES_READY",
      title: r.approvalMode === "AUTOPILOT" ? "MAIRO scheduled next week's posts" : "Next week's posts are ready to approve",
      body:
        r.approvalMode === "AUTOPILOT"
          ? `MAIRO planned ${result.created} post${result.created === 1 ? "" : "s"} for your goal and scheduled the ones with pictures. You can change or skip any of them in your Content Calendar.`
          : `MAIRO planned ${result.created} post${result.created === 1 ? "" : "s"} for your goal. Approve the week and MAIRO posts them.`,
      actionLabel: "Open Content Calendar",
      actionHref: "/dashboard/social/calendar",
      dedupeKey: `social-week:${week}`,
    }).catch((error) => console.error("Social week notification failed:", error));
  }
  return { planned };
}
