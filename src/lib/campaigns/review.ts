import { db } from "@/lib/db";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { normalizeUrl } from "@/lib/campaigns/destination";
import { probeLandingPage } from "@/lib/campaigns/landing-probe";
import type { CampaignPlan } from "@/lib/campaigns/plan";
import { reviewFindings, reviewStatus, type Finding, type ReviewFacts, type ReviewStatus } from "@/lib/campaigns/review-rules";
import { hasOwnWords, runningCopy } from "@/lib/campaigns/plan";
import { ctaLabel } from "@/lib/campaigns/ad-copy";
import { reviewCreative } from "@/lib/ai/review";
import { creativeImageUrl, scoreCopyWithAi } from "@/lib/ai/ad-score";
import { scoreCampaign, type AdScore } from "@/lib/score/rules";
import { loadBrain } from "@/lib/business/brain";
import { contextOf } from "@/lib/campaigns/plan";
import { businessCategory, type Category } from "@/lib/social/goals";
import { GROUP_ORDER, type GroupKey } from "@/lib/score/rules";
import { reviewOverview } from "@/lib/score/review";
import { questionsFor, type ReviewQuestion } from "@/lib/score/questions";
import { GOAL_PRIORITY } from "@/lib/brain/rules";
import { missionGoal } from "@/lib/mission/goals";

export type CampaignReview = {
  status: ReviewStatus;
  findings: Finding[];
  /** The Pre-Launch Ad Score, built from the same facts. */
  score: AdScore;
  /**
   * "Help MAIRO learn your business": a few questions across the areas to
   * improve first, and per area for its detail panel. Already-known answers
   * come back as "Is that still correct?".
   */
  questions: { learn: ReviewQuestion[]; byArea: Record<GroupKey, ReviewQuestion[]> };
  /** The kind of business, for offer ideas that suit it. */
  category: Category;
  /** The ad sends people to a website, so tracking matters. */
  website: boolean;
  /** What the business said it has for ads (photos, testimonials…), for creative advice. */
  assets: string[];
  checkedAt: string;
};

/** Gathers what the account can actually tell us, then applies the rules. */
export async function reviewCampaign(organizationId: string, plan: CampaignPlan): Promise<CampaignReview> {
  const url = plan.destinationType === "WEBSITE" ? normalizeUrl(plan.destinationValue) : null;

  const [connections, metaAccount, pixel, creative, billing, landing] = await Promise.all([
    connectionSummaries(organizationId),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { pageId: true } }),
    db.trackingPixel.findUnique({
      where: { organizationId_platform: { organizationId, platform: "META" } },
      select: { status: true },
    }),
    db.creativeRequest.count({
      where: { organizationId, status: { in: ["APPROVED", "DELIVERED"] }, images: { some: { isFinal: true } } },
    }),
    fetchMetaBillingStatus(organizationId),
    url ? probeLandingPage(url) : Promise.resolve(null),
  ]);

  const facts: ReviewFacts = {
    metaConnected: Boolean(connections.get("META")?.connected),
    pageChosen: Boolean(metaAccount?.pageId),
    funding: billing?.state ?? "unknown",
    currency: billing?.currency ?? null,
    metaPixelActive: pixel ? canOptimizeTowards(pixel.status) : false,
    hasApprovedCreative: creative > 0,
    landing,
  };

  const findings = reviewFindings(plan, facts);
  const brain = (await loadBrain(organizationId)).profile;
  const context = contextOf(plan);
  // A promotion given for this campaign is an offer for this campaign only.
  const offers = context.promotion.trim() ? [context.promotion.trim(), ...brain.offers] : brain.offers;
  // The safety check and the quality read run side by side; either failing
  // leaves the other standing, and the score falls back to reading structure.
  const [safety, ai] = await Promise.all([
    copySafety(plan),
    scoreCopyWithAi({
      plan,
      brandVoice: brain.brandVoice,
      offers,
      imageUrl: creativeImageUrl(plan, organizationId),
    }).catch((error) => {
      console.error("Ad score AI read failed:", error);
      return null;
    }),
  ]);
  if (safety) findings.push(safety);
  const score = scoreCampaign({ plan, facts, findings, ai, brain: { brandVoice: brain.brandVoice, offers: brain.offers } });

  const category = businessCategory(`${brain.industry} ${brain.overview} ${plan.offering} ${plan.businessName}`);
  const opts = { kept: context.kept, category, hasOwnWords: hasOwnWords(plan) };
  const first = reviewOverview(score, opts).priorities.map((p) => p.key);
  // The Business Brain decides which unknowns matter most for the current
  // goal — a leads goal asks about the offer and objections before branding.
  const mission = await db.marketingMission.findFirst({ where: { organizationId, status: "ACTIVE" }, orderBy: { approvedAt: "desc" }, select: { primaryGoal: true } });
  const prefer = mission ? GOAL_PRIORITY[missionGoal(mission.primaryGoal).metrics] : undefined;
  const ask = (areas: GroupKey[], limit: number) => questionsFor({ areas, category, goal: plan.goal, known: brain, context, limit, prefer });
  const questions = {
    learn: ask([...first, ...GROUP_ORDER.filter((k) => !first.includes(k))], 3),
    byArea: Object.fromEntries(GROUP_ORDER.map((k) => [k, ask([k], 3)])) as Record<GroupKey, ReviewQuestion[]>,
  };
  return { status: reviewStatus(findings), findings, score, questions, category, website: plan.destinationType === "WEBSITE", assets: brain.creativeAssets, checkedAt: new Date().toISOString() };
}

/**
 * The same AI safety review the words get at launch, run early so a problem
 * shows here with a way to fix it rather than as a refusal on the last screen.
 */
async function copySafety(plan: CampaignPlan): Promise<Finding | null> {
  if (!hasOwnWords(plan)) return null;
  const words = runningCopy(plan).filter((w) => w.primaryText.trim());
  if (words.length === 0) return null;
  try {
    const review = await reviewCreative({
      type: "COPY",
      brief: "Ad copy chosen and edited by the business in MAIRO's campaign builder.",
      businessName: plan.businessName,
      concept: words
        .map((w, i) => `Version ${i + 1}\n**Headline:** ${w.headline}\n**Primary text:** ${w.primaryText}\n**Call to action:** ${ctaLabel(w.cta)}`)
        .join("\n\n"),
    });
    if (review.verdict !== "BLOCK") return null;
    return {
      id: "copy-safety",
      severity: "blocking",
      area: "Advertisement",
      title: "The ad's words won't pass Meta's rules",
      detail: review.reason || "Something in the text would likely be rejected. Change it and check again.",
      fix: "ad",
    };
  } catch (error) {
    console.error("Copy safety review failed during campaign review:", error);
    return {
      id: "copy-safety-unavailable",
      severity: "recommendation",
      area: "Advertisement",
      title: "The ad's words couldn't be safety-checked just now",
      detail: "MAIRO checks them again when you launch, and nothing runs unchecked.",
      fix: null,
    };
  }
}
