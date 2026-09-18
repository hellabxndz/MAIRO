import { db } from "@/lib/db";

// What MAIRO actually knows about a business, and how sure it is.
//
// The promise this makes is that MAIRO gets better the longer you use it, and
// the risk it carries is that the promise becomes a progress bar that fills up
// on its own. So every number here is derived from rows that exist — an
// answered question, a real product, a campaign that ran, a creative with
// figures against it — and recomputed on every read. There is no stored score,
// because a stored score is a number that keeps going up after the thing it
// measured was deleted.
//
// The scores are honest in the other direction too. They are deliberately hard
// to max out: "Advertising history" needs months of real spend, not a signup
// form, so a brand new account sees a low number and a truthful sentence about
// why. A product that showed 100% on day one would be lying about the one
// thing this feature exists to communicate.
//
// Nothing here is a grade of the business. It is a measure of how much MAIRO
// has to work with, which is a different thing and is said that way in the UI:
// low scores come with what to do about them, not with disapproval.

export type KnowledgeArea =
  | "business"
  | "products"
  | "customers"
  | "creative"
  | "history";

export type KnowledgeSignal = {
  /** What MAIRO is looking for, in the customer's words. */
  label: string;
  /** Whether it has it. */
  known: boolean;
  /** Where to go and tell it, when it is missing and answerable. */
  href?: string;
};

export type KnowledgeScore = {
  area: KnowledgeArea;
  label: string;
  /** 0–100, derived. Never stored. */
  percent: number;
  /** One line on what this means and what would raise it. */
  summary: string;
  /** The individual things that made up the score. */
  signals: KnowledgeSignal[];
};

export type MemoryProfile = {
  scores: KnowledgeScore[];
  /** The average, for the headline. */
  overall: number;
  /**
   * The single most useful thing the customer could do next.
   *
   * Null when the only thing missing is time — which is the honest answer for
   * a new account, and better than inventing a task so the card has a button.
   */
  nextStep: { label: string; href: string; why: string } | null;
};

/** A percentage from a list of yes/no signals, rounded to whole points. */
function scoreOf(signals: KnowledgeSignal[]): number {
  if (signals.length === 0) return 0;
  const known = signals.filter((s) => s.known).length;
  return Math.round((known / signals.length) * 100);
}

const AREA_LABELS: Record<KnowledgeArea, string> = {
  business: "Your business",
  products: "What you sell",
  customers: "Who buys from you",
  creative: "What works in your ads",
  history: "Your advertising history",
};

/**
 * Read everything MAIRO has learned about one business.
 *
 * One pass over the tables that hold the answers. Deliberately not cached:
 * this is read on a page somebody opened to find out what MAIRO knows, and a
 * cached answer to that question is the wrong answer the moment they fill
 * something in.
 */
export async function memoryProfile(organizationId: string): Promise<MemoryProfile> {
  const [org, intake, productCount, pricedProducts, campaigns, creatives, appliedActions] =
    await Promise.all([
      db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, industry: true, website: true },
      }),
      db.onboardingIntake.findUnique({ where: { organizationId } }),
      db.product.count({ where: { organizationId } }),
      db.product.count({ where: { organizationId, priceCents: { not: null } } }),
      db.mairoCampaign.findMany({
        where: { organizationId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          geoKey: true,
          ageMin: true,
          ageMax: true,
        },
      }),
      db.platformCreative.count({ where: { organizationId } }),
      db.optimizationRecommendation.count({
        where: { mairoCampaign: { organizationId }, appliedAt: { not: null } },
      }),
    ]);

  const everLive = campaigns.filter((c) => c.status !== "DRAFT");
  // The same test the campaign page and the timeline use: a place chosen, or
  // an age range narrowed from the schema defaults. Age columns are NOT
  // nullable — they default to 18–65 — so "is it set" has to mean "is it
  // different", or every campaign ever created would count as targeted.
  const targeted = campaigns.filter(
    (c) => Boolean(c.geoKey) || c.ageMin !== 18 || c.ageMax !== 65,
  );

  // The oldest campaign is how long MAIRO has been watching. Months, because
  // advertising patterns are seasonal and a fortnight tells you very little.
  const firstCampaign = campaigns.reduce<Date | null>(
    (oldest, c) => (oldest === null || c.createdAt < oldest ? c.createdAt : oldest),
    null,
  );
  const monthsRunning = firstCampaign
    ? (Date.now() - firstCampaign.getTime()) / (1000 * 60 * 60 * 24 * 30)
    : 0;

  const business: KnowledgeSignal[] = [
    { label: "What your business is called", known: Boolean(org?.name?.trim()) },
    { label: "What industry you are in", known: Boolean(org?.industry?.trim()), href: "/dashboard/settings" },
    { label: "Your website", known: Boolean(org?.website?.trim()), href: "/dashboard/settings" },
    { label: "What you want advertising to do", known: Boolean(intake?.primaryGoal) },
    { label: "What you can spend a month", known: Boolean(intake?.monthlyBudgetCents) },
    { label: "How your brand should sound", known: Boolean(intake?.brandVoice?.trim()), href: "/dashboard/settings" },
  ];

  const products: KnowledgeSignal[] = [
    { label: "At least one product or service", known: productCount > 0, href: "/dashboard/sales-setup" },
    { label: "A range to choose between", known: productCount >= 3, href: "/dashboard/sales-setup" },
    { label: "What they cost", known: pricedProducts > 0, href: "/dashboard/sales-setup" },
    { label: "Prices on most of them", known: productCount > 0 && pricedProducts >= productCount * 0.7 },
  ];

  const customers: KnowledgeSignal[] = [
    { label: "Who you are trying to reach", known: Boolean(intake?.targetAudience?.trim()), href: "/dashboard/settings" },
    { label: "Who you are competing with", known: Boolean(intake?.competitors?.trim()), href: "/dashboard/settings" },
    { label: "Where your customers are", known: targeted.length > 0, href: "/dashboard/campaigns" },
    { label: "Targeting on more than one campaign", known: targeted.length >= 2 },
  ];

  // Creative learning is the one that genuinely cannot be filled in by
  // answering questions. It needs ads that ran and figures that came back.
  const creative: KnowledgeSignal[] = [
    { label: "Ads written for you", known: creatives > 0, href: "/dashboard/creatives" },
    { label: "Enough of them to compare", known: creatives >= 4, href: "/dashboard/creatives" },
    { label: "Some of them have run", known: everLive.length > 0 },
    { label: "MAIRO has acted on what it saw", known: appliedActions > 0 },
  ];

  const history: KnowledgeSignal[] = [
    { label: "A campaign has gone live", known: everLive.length > 0, href: "/dashboard/create" },
    { label: "More than one campaign to compare", known: everLive.length >= 2 },
    { label: "A month of advertising behind you", known: monthsRunning >= 1 },
    { label: "Three months, enough to see a pattern", known: monthsRunning >= 3 },
    { label: "A full season", known: monthsRunning >= 6 },
  ];

  const scores: KnowledgeScore[] = [
    {
      area: "business",
      label: AREA_LABELS.business,
      percent: scoreOf(business),
      summary:
        "Everything MAIRO writes starts here — the goal, the budget and the voice go into every plan and every ad.",
      signals: business,
    },
    {
      area: "products",
      label: AREA_LABELS.products,
      percent: scoreOf(products),
      summary:
        "What you sell and what it costs. Without prices MAIRO cannot tell whether an ad is paying for itself.",
      signals: products,
    },
    {
      area: "customers",
      label: AREA_LABELS.customers,
      percent: scoreOf(customers),
      summary:
        "Who to show your ads to. A campaign aimed at everybody spends most of its budget on people who will never buy.",
      signals: customers,
    },
    {
      area: "creative",
      label: AREA_LABELS.creative,
      percent: scoreOf(creative),
      summary:
        "Which of your ads work, and why. This one cannot be filled in by answering questions — it comes from ads that have actually run.",
      signals: creative,
    },
    {
      area: "history",
      label: AREA_LABELS.history,
      percent: scoreOf(history),
      summary:
        "How long MAIRO has been watching. Advertising is seasonal, so this one only moves with time and there is no way to hurry it.",
      signals: history,
    },
  ];

  const overall = Math.round(scores.reduce((sum, s) => sum + s.percent, 0) / scores.length);

  // The first missing thing the customer could actually do something about,
  // in the order the scores are shown. Signals with no href are ones only time
  // or advertising can fill, and those are never suggested as a task.
  const actionable = scores
    .flatMap((s) => s.signals.map((sig) => ({ ...sig, area: s.label })))
    .find((sig) => !sig.known && sig.href);

  return {
    scores,
    overall,
    nextStep: actionable
      ? {
          label: actionable.label,
          href: actionable.href!,
          why: `MAIRO does not know this yet, and it feeds into ${actionable.area.toLowerCase()}.`,
        }
      : null,
  };
}

/**
 * The same profile, condensed for the assistant's system prompt.
 *
 * Told what it does NOT know as well as what it does, because an assistant
 * that has not been told its own blind spots fills them in confidently — and
 * a confident guess about somebody's own business is the fastest way to lose
 * them.
 */
export function memoryBrief(profile: MemoryProfile): string {
  const missing = profile.scores
    .flatMap((s) => s.signals.filter((sig) => !sig.known).map((sig) => sig.label))
    .slice(0, 8);

  const lines = profile.scores.map((s) => `- ${s.label}: ${s.percent}%`);

  return [
    `How much MAIRO knows about this business, as a percentage per area (${profile.overall}% overall):`,
    ...lines,
    missing.length > 0
      ? `\nThings you do NOT know and must not guess at: ${missing.join("; ")}. If a question depends on one of these, say you do not have it and ask.`
      : "\nYou have everything on file for this business.",
  ].join("\n");
}
