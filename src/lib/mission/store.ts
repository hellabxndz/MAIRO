import { db } from "@/lib/db";
import { newPlan, type CampaignPlan } from "@/lib/campaigns/plan";
import { supportsDestination } from "@/lib/campaigns/objectives";
import { wallClockInZone, instantFromLocal } from "@/lib/campaigns/schedule";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { socialAccess } from "@/lib/social/access";
import { loadStrategy, savePromotion, setGoal, socialLearnings } from "@/lib/social/manager";
import { goalInfo as socialGoalInfo, type GoalKey as SocialGoalKey, type PromotionDetails } from "@/lib/social/goals";
import { effectiveLevel } from "@/lib/decisions/store";
import { MISSION_GOALS, dateIn, goalPhrase, missionGoal, missingQuestions, resultsForGoal, type MissionGoal, type ResultFigures, type ResultTile, type Understood } from "./goals";
import { FROM_AD_GOAL, planBrief } from "@/lib/engine/brief";
import { enginePromotions, missionConfidence } from "@/lib/engine";
import { justifyAction, promotionPlan, type Confidence } from "@/lib/engine/core";
import { buildMissionPlan, interpretRequest, missionPlanSchema, understandBusiness, type MissionPlan } from "./planner";

// The business's mission, from goal to plan to approval, and everything that
// follows from it. Nothing here launches or spends: an approved mission
// prefills a Create draft (where the budget is confirmed), and on Scale sets
// Social Manager's goal so ads and social run as one strategy.

const DAY = 86_400_000;

export type MissionView = {
  id: string;
  status: string;
  title: string;
  primaryGoal: MissionGoal;
  secondaryGoal: MissionGoal | null;
  request: string;
  plan: MissionPlan;
  aiUsed: boolean;
  approvedAt: Date | null;
  campaignDraftId: string | null;
  createdAt: Date;
};

function toView(row: { id: string; status: string; title: string; primaryGoal: string; secondaryGoal: string | null; request: string; planJson: string; aiUsed: boolean; approvedAt: Date | null; campaignDraftId: string | null; createdAt: Date }): MissionView | null {
  try {
    const plan = JSON.parse(row.planJson) as MissionPlan;
    missionPlanSchema.parse(plan);
    return { ...row, primaryGoal: row.primaryGoal as MissionGoal, secondaryGoal: (row.secondaryGoal as MissionGoal | null) ?? null, plan };
  } catch {
    return null;
  }
}

export async function activeMission(organizationId: string): Promise<MissionView | null> {
  const row = await db.marketingMission.findFirst({ where: { organizationId, status: "ACTIVE" }, orderBy: { approvedAt: "desc" } });
  return row ? toView(row) : null;
}

export async function proposedMission(organizationId: string): Promise<MissionView | null> {
  const row = await db.marketingMission.findFirst({ where: { organizationId, status: "PROPOSED" }, orderBy: { createdAt: "desc" } });
  return row ? toView(row) : null;
}

async function zoneOf(organizationId: string): Promise<string> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  return org?.timezone || "America/New_York";
}

export async function todayFor(organizationId: string, now = new Date()): Promise<string> {
  const s = wallClockInZone(now, await zoneOf(organizationId)).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : now.toISOString().slice(0, 10);
}

// --- Start: goal → understanding → (a question or two) → plan ---------------

export type StartResult =
  | { kind: "questions"; questions: { key: string; question: string; placeholder: string }[]; understood: Understood }
  | { kind: "plan"; missionId: string; ai: boolean };

/** Records an answer to one of MAIRO's questions, so it's never asked again. */
async function saveAnswers(organizationId: string, answers: Record<string, string>) {
  for (const [key, value] of Object.entries(answers)) {
    const text = value.trim();
    if (!text || !["sells", "location"].includes(key)) continue;
    await db.missionNote.create({ data: { organizationId, kind: "INFO", text: key === "sells" ? `We sell: ${text}` : text, detailsJson: JSON.stringify({ [key]: text }) } });
  }
}

/**
 * Turns a goal (a button) or a request (their own words) into a PROPOSED
 * mission with a plan. Asks at most two simple questions first, and only
 * when the answer really changes the plan.
 */
export async function startMission(
  organizationId: string,
  input: { goal?: MissionGoal | null; secondary?: MissionGoal | null; request?: string; answers?: Record<string, string> },
): Promise<StartResult> {
  const today = await todayFor(organizationId);
  if (input.answers) await saveAnswers(organizationId, input.answers);
  const facts = await understandBusiness(organizationId);
  const request = (input.request ?? "").trim();
  const understood: Understood = request ? await interpretRequest(request, today, facts) : { intent: "goal", goal: input.goal ?? null, item: null, price: null, date: null, endDate: null, discount: null };
  const goal: MissionGoal = input.goal ?? understood.goal ?? "RECOMMEND";

  const launchGoal = goal === "NEW_PRODUCT" || goal === "NEW_SERVICE" || goal === "PROMOTE_SALE";
  const launch = launchGoal || understood.intent === "launch" || understood.intent === "promotion"
    ? {
        item: understood.item ?? input.answers?.item ?? null,
        price: understood.price,
        date: understood.date ?? parseAnsweredDate(input.answers?.date, today),
        endDate: understood.endDate,
        discount: understood.discount,
      }
    : null;

  const questions = missingQuestions({
    goal,
    sells: facts.sells,
    location: Boolean(facts.location) || Boolean(input.answers?.location),
    launch: goal === "NEW_PRODUCT" || goal === "NEW_SERVICE" ? launch : null,
  }).filter((q) => !input.answers?.[q.key]);
  if (questions.length) return { kind: "questions", questions, understood: { ...understood, goal } };

  const { plan, ai } = await buildMissionPlan(organizationId, { goal, secondary: input.secondary ?? null, request, focusItem: understood.item, launch, understood, today }, facts);
  await db.marketingMission.deleteMany({ where: { organizationId, status: "PROPOSED" } });
  const row = await db.marketingMission.create({
    data: {
      organizationId,
      status: "PROPOSED",
      primaryGoal: plan.goal,
      secondaryGoal: plan.secondaryGoal,
      request,
      title: plan.title,
      planJson: JSON.stringify(plan),
      aiUsed: ai,
    },
  });
  return { kind: "plan", missionId: row.id, ai };
}

function parseAnsweredDate(value: string | undefined, today: string): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  return dateIn(value, today).start;
}

// --- Approve -----------------------------------------------------------------------

/** The approved mission as a Create draft — the same one they'd fill in by hand, prefilled. */
export function campaignPlanFromMission(plan: MissionPlan, org: { name: string; website: string | null; phone: string | null; defaultMessageChannel: CampaignPlan["messageChannel"] }, brief: { offering: string; audience: string }): CampaignPlan {
  const base = newPlan({
    service: "meta",
    businessName: org.name,
    website: org.website,
    offering: [
      brief.offering,
      plan.focusItem ? `Focus: ${plan.focusItem}` : "",
      plan.launch?.discount ? `Offer: ${plan.launch.discount}` : "",
      // The Strategy Engine's message and call to action, so the ad copy MAIRO writes follows the strategy.
      plan.engine ? `Key message: ${plan.engine.messaging[0] ?? ""}` : "",
      plan.engine ? `Ask people to: ${plan.engine.cta}` : "",
    ].filter(Boolean).join(". "),
    targetAudience: plan.tactics.audience || brief.audience,
    differentiator: plan.why,
    messageChannel: org.defaultMessageChannel,
    timeZone: "",
    metaPercent: 100,
  });
  const goal = plan.adSetup.goal;
  const destination = plan.adSetup.destination && supportsDestination(goal, plan.adSetup.destination) ? plan.adSetup.destination : null;
  return {
    ...base,
    promotes: plan.launch?.discount ? "OFFER" : plan.focusItem ? (plan.goal === "NEW_SERVICE" || plan.adSetup.goal === "LEADS" ? "SERVICE" : "PRODUCT") : "BUSINESS",
    promotesDetail: plan.focusItem ?? "",
    goal,
    destinationType: destination,
    destinationValue: destination === "WEBSITE" ? org.website ?? "" : destination === "PHONE_CALL" ? org.phone ?? "" : "",
    budgetType: "DAILY",
    dailyAmount: Math.round(plan.dailyBudget),
  };
}

const SOCIAL_GOAL = Object.fromEntries(MISSION_GOALS.map((g) => [g.key, g.social])) as Record<MissionGoal, SocialGoalKey>;

/**
 * Approves a proposed mission: it becomes the active one (the old one is
 * archived), a Create draft is prefilled from it, and on Scale Social
 * Manager takes the same goal. Nothing is launched or spent here.
 */
export async function approveMission(organizationId: string, missionId: string, userId: string | null): Promise<{ draftId: string | null; social: boolean }> {
  const row = await db.marketingMission.findFirst({ where: { id: missionId, organizationId, status: "PROPOSED" } });
  const view = row ? toView(row) : null;
  if (!row || !view) throw new Error("That plan isn't waiting for approval any more.");
  const plan = view.plan;

  const [org, brain] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, website: true, phone: true, defaultMessageChannel: true } }),
    db.businessBrain.findUnique({ where: { organizationId }, select: { profileJson: true } }),
  ]);
  let offering = "";
  let audience = "";
  try {
    const p = brain ? (JSON.parse(brain.profileJson) as { overview?: string; targetCustomer?: string }) : {};
    offering = p.overview ?? "";
    audience = p.targetCustomer ?? "";
  } catch {
    // An unreadable profile just means less is prefilled.
  }
  let draftId: string | null = null;
  if (org) {
    const data = campaignPlanFromMission(plan, org, { offering, audience });
    const draft = await db.campaignDraft.create({
      data: {
        organizationId,
        createdByUserId: userId,
        service: "meta",
        step: "business",
        label: `MAIRO plan — ${plan.title}`.slice(0, 120),
        data: JSON.parse(JSON.stringify(data)),
      },
      select: { id: true },
    });
    draftId = draft.id;
  }

  await db.marketingMission.updateMany({ where: { organizationId, status: "ACTIVE" }, data: { status: "ARCHIVED" } });
  await db.marketingMission.update({ where: { id: row.id }, data: { status: "ACTIVE", approvedAt: new Date(), campaignDraftId: draftId } });

  // Scale: Social Manager works toward the same goal, as part of one plan.
  let social = false;
  if ((await socialAccess(organizationId)).ok) {
    const existing = await loadStrategy(organizationId);
    const launch = plan.launch;
    const promotion =
      launch && launch.date && (plan.goal === "NEW_PRODUCT" || plan.goal === "NEW_SERVICE")
        ? { kind: plan.goal, details: clean({ name: launch.item ?? plan.focusItem ?? plan.title, description: view.request || plan.strategy, price: launch.price, start: launch.date, promotion: launch.discount, end: launch.endDate }) as PromotionDetails }
        : launch && launch.date && plan.goal === "PROMOTE_SALE"
          ? { kind: "SALE" as const, details: clean({ offer: launch.item ? `${launch.discount ?? "Sale"} on ${launch.item}` : launch.discount ?? view.request, discount: launch.discount, start: launch.date, end: launch.endDate ?? launch.date }) as PromotionDetails }
          : null;
    await setGoal(organizationId, {
      goal: SOCIAL_GOAL[plan.goal],
      goalDetail: view.request || plan.mission,
      platforms: existing?.platforms.length ? existing.platforms : ["INSTAGRAM"],
      postsPerWeek: existing?.postsPerWeek ?? (plan.secondaryGoal === "GROW_SOCIAL" ? 5 : 4),
      promotion,
      direction: plan.engine
        ? [plan.engine.statement, `Message: ${plan.engine.messaging.join("; ")}.`, `Call to action: ${plan.engine.cta}.`, plan.engine.offer.guidance, plan.engine.organic ?? ""].filter(Boolean).join(" ")
        : null,
    });
    social = true;
  }
  return { draftId, social };
}

function clean(o: Record<string, string | null | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== ""));
}

/** When a Create draft MAIRO prefilled becomes a campaign, it carries the mission's objective and reason. */
export async function linkMissionCampaign(organizationId: string, draftId: string, campaignId: string): Promise<void> {
  const mission = await db.marketingMission.findFirst({ where: { organizationId, campaignDraftId: draftId }, select: { id: true, planJson: true } });
  if (!mission) return;
  try {
    const plan = JSON.parse(mission.planJson) as MissionPlan;
    await db.mairoCampaign.updateMany({
      where: { id: campaignId, organizationId },
      data: { missionId: mission.id, marketingObjective: plan.adConcepts[0]?.objective ?? "Conversion", whyText: `${plan.strategy} ${plan.why}`.slice(0, 1000) },
    });
  } catch {
    // The campaign stands on its own if the plan can't be read.
  }
}

/** The objective and reason for a new creative, from the active mission. */
export async function creativeObjective(organizationId: string, extra: { format?: string | null; message?: string | null } = {}): Promise<{ marketingObjective: string; whyText: string; briefJson: string } | null> {
  const m = await activeMission(organizationId);
  if (!m) return null;
  const concept = m.plan.adConcepts[0];
  return {
    marketingObjective: concept?.objective ?? "Conversion",
    whyText: `Made for your goal: ${missionGoal(m.primaryGoal).label.toLowerCase()}. ${concept?.why ?? ""}`.trim().slice(0, 600),
    // The Strategy Engine's brief: goal, objective, audience, hook, message, CTA, format, reason.
    briefJson: JSON.stringify(planBrief(m.plan, concept ?? null, { format: extra.format, message: extra.message })),
  };
}

// --- "Tell MAIRO something new" ----------------------------------------------------

export type TellResult = {
  kind: "proposal" | "promotion" | "unavailable" | "noted" | "questions";
  message: string;
  /** What MAIRO decided to do about it, in plain words. */
  actions: string[];
  missionId?: string;
  questions?: { key: string; question: string; placeholder: string }[];
};

export async function tellMairo(organizationId: string, text: string, now = new Date()): Promise<TellResult> {
  const today = await todayFor(organizationId, now);
  const facts = await understandBusiness(organizationId);
  const u = await interpretRequest(text, today, facts);
  const current = await activeMission(organizationId);
  const zone = await zoneOf(organizationId);
  const at = (d: string | null) => (d ? instantFromLocal(`${d}T12:00`, zone) : null);

  if (u.intent === "unavailable") {
    const item = u.item ?? text;
    await db.missionNote.create({ data: { organizationId, kind: "UNAVAILABLE", text: item, detailsJson: JSON.stringify(u) } });
    // Stop planned social posts that send people to it.
    const words = item.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const pending = await db.instagramPost.findMany({ where: { organizationId, status: { in: ["SUGGESTED", "DRAFT", "SCHEDULED"] } }, select: { id: true, caption: true } });
    const hits = pending.filter((p) => words.length > 0 && words.every((w) => p.caption.toLowerCase().includes(w)));
    if (hits.length) await db.instagramPost.updateMany({ where: { id: { in: hits.map((h) => h.id) } }, data: { status: "SKIPPED", approvedAt: null, error: `Skipped: ${item} is unavailable.` } });
    return {
      kind: "unavailable",
      message: `Got it — MAIRO won't send customers toward ${item}.`,
      actions: [
        `New ads, creatives and posts won't promote ${item}.`,
        hits.length ? `${hits.length} planned social post${hits.length === 1 ? " was" : "s were"} skipped.` : "No planned posts mentioned it.",
        "If a running ad features it, MAIRO flags it on your Mission page so you can pause or change it.",
        "Tell MAIRO when it's back and it can be promoted again.",
      ],
    };
  }

  if (u.intent === "promotion") {
    const start = u.date ?? today;
    const end = u.endDate ?? u.date ?? new Date(Date.parse(`${start}T12:00:00Z`) + 2 * DAY).toISOString().slice(0, 10);
    // The Strategy Engine decides when to introduce it, how often to mention
    // it, whether ads or creatives change, and when urgency is honest.
    const since = new Date(now.getTime() - 30 * DAY);
    const [running, before, promoCreatives] = await Promise.all([
      db.mairoCampaign.count({ where: { organizationId, status: "ACTIVE" } }),
      enginePromotions(organizationId, today),
      db.creativeRequest.count({ where: { organizationId, marketingObjective: "Promotion", createdAt: { gte: since } } }),
    ]);
    await db.missionNote.create({ data: { organizationId, kind: "PROMOTION", text, detailsJson: JSON.stringify(u), startsAt: at(start), endsAt: at(end) } });
    const p = promotionPlan({ start, end, today, campaignsRunning: running, promotionsLast30Days: before.last30Days + 1, hasPromoCreative: promoCreatives > 0 });
    const actions = [
      `Your ${u.discount ?? "offer"}${u.item ? ` on ${u.item}` : ""} runs ${start === end ? `on ${start}` : `${start} to ${end}`}. ${p.introduce}`,
      `Ads: ${p.adsChange.why}`,
      p.newCreatives.yes ? `Creative: ${p.newCreatives.why} MAIRO will suggest one.` : `Creative: ${p.newCreatives.why}`,
      p.urgency.length ? `Urgency: only at the end — ${p.urgency.map((x) => `"${x.message}" on ${x.date}`).join(", ")}.` : "No countdown — there's no end date to count down to.",
      `MAIRO mentions it about ${p.mentionsPerWeek}× a week so it doesn't drown out everything else.`,
      ...(p.restraint ? [p.restraint] : []),
    ];
    if ((await socialAccess(organizationId)).ok && (await loadStrategy(organizationId))) {
      await savePromotion(organizationId, "SALE", clean({ offer: u.item ? `${u.discount ?? "Sale"} on ${u.item}` : u.discount ?? text, discount: u.discount, start, end }) as PromotionDetails);
      actions.push("Scale: Social Manager added launch, reminder and last-chance posts to your Content Calendar, mixed with regular posts.");
    }
    return { kind: "promotion", message: "MAIRO added your promotion to the plan.", actions };
  }

  if (u.intent === "launch" || u.intent === "goal") {
    const goal = u.goal ?? "RECOMMEND";
    const result = await startMission(organizationId, { goal, request: text, secondary: current?.secondaryGoal ?? null });
    if (result.kind === "questions") return { kind: "questions", message: "A quick question first, so the plan fits.", actions: [], questions: result.questions };
    return {
      kind: "proposal",
      missionId: result.missionId,
      message: current && current.primaryGoal !== goal && u.intent === "goal"
        ? `Your current goal is ${goalPhrase(current.primaryGoal)}. MAIRO recommends changing it to ${goalPhrase(goal)}. Here's the strategy it would use.`
        : u.intent === "launch"
          ? "MAIRO created a launch plan. Review it and approve."
          : "MAIRO created a plan. Review it and approve.",
      actions: [],
    };
  }

  await db.missionNote.create({ data: { organizationId, kind: "INFO", text, detailsJson: JSON.stringify(u) } });
  return { kind: "noted", message: "Noted. MAIRO will use this when it plans your marketing.", actions: [] };
}

// --- What MAIRO is doing, what happened, what it learned, what's next --------------

export type MissionActivity = {
  campaignsRunning: number;
  creativesTesting: number;
  /** How MAIRO is optimizing the running campaigns, in plain words. */
  optimizing: { campaigns: number; how: "automatic" | "autopilot" | "suggest" };
  /** Null when not on active Scale: Social Manager isn't part of their plan. */
  socialScheduled: number | null;
  socialPublished: number | null;
  nextPost: { when: string; network: "Instagram" | "Facebook" } | null;
  organicGoal: string | null;
  promotionsActive: number;
  promotion: string | null;
};

export async function missionActivity(organizationId: string, now = new Date()): Promise<MissionActivity> {
  const [running, ads, scale, scheduled, published, promos, level, next, strategy, zone] = await Promise.all([
    db.mairoCampaign.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true } }),
    db.campaignAd.count({ where: { mairoCampaign: { organizationId, status: "ACTIVE" } } }),
    socialAccess(organizationId),
    db.instagramPost.count({ where: { organizationId, status: { in: ["SCHEDULED", "SUGGESTED"] }, scheduledFor: { gt: now, lte: new Date(now.getTime() + 7 * DAY) } } }),
    db.instagramPost.count({ where: { organizationId, status: "PUBLISHED", postedAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    db.missionNote.findMany({ where: { organizationId, kind: "PROMOTION", active: true, endsAt: { gte: now } }, orderBy: { endsAt: "asc" }, select: { text: true } }),
    effectiveLevel(organizationId),
    db.instagramPost.findFirst({ where: { organizationId, status: "SCHEDULED", scheduledFor: { gt: now } }, orderBy: { scheduledFor: "asc" }, select: { scheduledFor: true, network: true } }),
    db.socialStrategy.findUnique({ where: { organizationId }, select: { goal: true } }),
    zoneOf(organizationId),
  ]);
  const when = next?.scheduledFor
    ? new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: zone }).format(next.scheduledFor).replace(" at ", " · ")
    : null;
  return {
    campaignsRunning: running.length,
    creativesTesting: ads,
    optimizing: { campaigns: running.length, how: level === "AUTOPILOT" ? "autopilot" : level === "ASSISTED" ? "automatic" : "suggest" },
    socialScheduled: scale.ok ? scheduled : null,
    socialPublished: scale.ok ? published : null,
    nextPost: scale.ok && when && next ? { when, network: next.network === "FACEBOOK" ? "Facebook" : "Instagram" } : null,
    organicGoal: scale.ok && strategy ? socialGoalInfo(strategy.goal).label : null,
    promotionsActive: promos.length,
    promotion: promos[0]?.text ?? null,
  };
}

/** Results for the mission's goal over the last `days` days. Never another goal's metric. */
export async function missionResults(organizationId: string, goal: MissionGoal, days = 7): Promise<{ tiles: ResultTile[]; hasData: boolean; confidence: Confidence }> {
  const family = missionGoal(goal).metrics;
  const until = new Date();
  const since = new Date(until.getTime() - days * DAY);
  const [report, social] = await Promise.all([
    fetchOrganizationPerformance(organizationId, { since, until }).catch(() => null),
    db.instagramPost.aggregate({ where: { organizationId, status: "PUBLISHED", postedAt: { gte: since } }, _sum: { likeCount: true, commentCount: true }, _count: { _all: true } }),
  ]);
  const t = report?.total;
  const figures: ResultFigures = {
    spendCents: t?.spendCents ?? null,
    purchases: t?.purchases ?? null,
    revenueCents: t?.revenueCents ?? null,
    costPerPurchaseCents: t?.costPerPurchaseCents ?? null,
    roas: t?.roas ?? null,
    leads: t?.leads ?? null,
    bookings: t?.bookings ?? null,
    contacts: t?.contacts ?? null,
    landingPageViews: t?.landingPageViews ?? null,
    conversions: t?.conversions ?? null,
    engagement: t?.engagement ?? null,
    clicks: t?.clicks ?? null,
    reach: t?.reach ?? null,
    impressions: t?.impressions ?? null,
    videoViews: t?.videoViews ?? null,
  };
  const socialFigures = { likes: social._sum.likeCount ?? 0, comments: social._sum.commentCount ?? 0, posts: social._count._all };
  const confidence = await missionConfidence(organizationId, family, figures);
  return { tiles: resultsForGoal(family, figures, socialFigures), hasData: Boolean(report?.hasData), confidence };
}

/** What MAIRO learned, and what it's changing because of it. Only from real results. */
export async function missionLearned(organizationId: string): Promise<{ learned: string; adjusted: string }[]> {
  const [rows, social] = await Promise.all([
    db.mairoLearning.findMany({ where: { organizationId, active: true, confidence: { in: ["HIGH", "MEDIUM"] } }, orderBy: { lastSeenAt: "desc" }, take: 3 }),
    socialLearnings(organizationId),
  ]);
  // Strategy Engine lessons say exactly what changes; others lean on plans in general.
  const out = rows.map((r) => ({ learned: r.statement, adjusted: r.key.startsWith("engine:") ? r.detail : "MAIRO is leaning on this in your next ad concepts and plans." }));
  if (social.best && social.weakest) {
    out.push({ learned: `${social.best} posts get more engagement than ${social.weakest} posts on your feed.`, adjusted: `Your next social posts include more ${social.best.toLowerCase()} content.` });
  }
  return out.slice(0, 3);
}

export type Recommendation = { title: string; text: string; href: string; label: string };

/**
 * What MAIRO suggests next, from real data only. Suggestions — the owner
 * approves anything that changes spend or ads.
 */
export async function missionRecommendations(organizationId: string, mission: MissionView | null, now = new Date()): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  if (!mission) return out;
  const family = missionGoal(mission.primaryGoal).metrics;
  const [running, promos, unavailable, scale, upcoming] = await Promise.all([
    db.mairoCampaign.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true, objective: true, ads: { select: { headline: true, primaryText: true } } } }).catch(() => []),
    db.missionNote.findMany({ where: { organizationId, kind: "PROMOTION", active: true, endsAt: { gte: now } } }),
    db.missionNote.findMany({ where: { organizationId, kind: "UNAVAILABLE", active: true } }),
    socialAccess(organizationId),
    db.instagramPost.count({ where: { organizationId, scheduledFor: { gt: now, lte: new Date(now.getTime() + 7 * DAY) }, status: { notIn: ["SKIPPED", "FAILED"] } } }),
  ]);

  if (running.length === 0) {
    out.push({
      title: "Start the campaign MAIRO planned",
      text: "Your plan is approved, but no campaign is running for it yet. MAIRO prefilled it — you'll confirm the budget before anything goes live.",
      href: mission.campaignDraftId ? `/dashboard/create/meta?draft=${mission.campaignDraftId}` : "/dashboard/create/meta",
      label: "Review the campaign",
    });
  }
  for (const p of promos) {
    if (p.endsAt && p.endsAt.getTime() - now.getTime() <= 3 * DAY) {
      const daysLeft = Math.max(0, Math.ceil((p.endsAt.getTime() - now.getTime()) / DAY));
      out.push({ title: "Your promotion is ending", text: `"${p.text}" ends in ${daysLeft === 0 ? "less than a day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}. MAIRO recommends increasing urgency in your ads and posts.`, href: "/dashboard/campaigns", label: "Review your ads" });
    }
  }
  for (const u of unavailable) {
    const words = u.text.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const hit = running.find((c) => c.ads.some((a) => words.length > 0 && words.every((w) => `${a.headline ?? ""} ${a.primaryText ?? ""}`.toLowerCase().includes(w))));
    if (hit) out.push({ title: `${hit.name} still promotes ${u.text}`, text: `You told MAIRO ${u.text} is unavailable. MAIRO recommends pausing or changing that ad.`, href: `/dashboard/campaigns/${hit.id}`, label: "Open the campaign" });
  }

  // The core rule, applied to what's already running: a campaign that can't
  // say which part of the goal it serves is worth a second look.
  const engine = mission.plan.engine;
  if (engine) {
    for (const c of running) {
      const check = justifyAction(engine, { kind: "campaign", adGoal: c.objective, objective: FROM_AD_GOAL[c.objective] });
      if (!check.ok) {
        out.push({ title: `"${c.name}" isn't working toward your goal`, text: `${check.reason} MAIRO recommends pausing it or moving its budget to a campaign built for ${engine.objective.goalLabel.toLowerCase()}.`, href: `/dashboard/campaigns/${c.id}`, label: "Open the campaign" });
      }
    }
  }

  // From results: people clicking but not buying.
  if (running.length && family === "sales") {
    const until = now;
    const since = new Date(now.getTime() - 7 * DAY);
    const report = await fetchOrganizationPerformance(organizationId, { since, until }).catch(() => null);
    const t = report?.total;
    if (t && (t.clicks ?? 0) >= 50 && (t.purchases ?? 0) === 0) {
      out.push({ title: "Traffic, but no purchases yet", text: "Your ads are bringing people to your site but no purchases are tracked. MAIRO recommends testing stronger product proof — reviews, demonstrations — and checking your site's purchase tracking.", href: "/dashboard/decisions", label: "See MAIRO's decisions" });
    }
  }
  if (scale.ok && upcoming === 0) {
    out.push({ title: "No social posts planned this week", text: "Social Manager has nothing scheduled for the next 7 days. Plan the week so your feed backs up your ads.", href: "/dashboard/social", label: "Plan the week" });
  }
  return out.slice(0, 4);
}
