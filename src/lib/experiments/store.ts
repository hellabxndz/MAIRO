import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { AdGoal } from "@/generated/prisma/enums";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";
import { persistDrafts } from "@/lib/decisions/store";
import { listSuggestions, planFromApproval } from "@/lib/suggested-ads/store";
import { EVIDENCE, judge, type VariantFigures, type Verdict } from "./verdict";

// Creative tests, from proposal to verdict.
//
//   PROPOSED   two directions are approved; MAIRO writes down a fair test
//   APPROVED   the owner wants it run; MAIRO makes a campaign draft with both
//              sets of words on the same picture, which the owner builds and
//              launches in the usual builder (nothing runs before that)
//   RUNNING    the campaign is live; each day MAIRO reads Meta's per-ad
//              figures and checks them against the evidence rules
//   CONCLUDED  a winner, no clear difference, an unfair split, or out of time
//              — and for a winner, a proposal to switch off the other ad,
//              which waits for the owner's approval like any other decision
//   CANCELED   the owner stopped it, or the campaign went away
//
// Every figure comes from Meta's per-ad results for the test's own campaign.
// Nothing is estimated, and nothing is switched off by the test itself.

export type ExperimentVariant = {
  label: string;
  angleRevisionId?: string;
  studioVersionId?: string;
  /** Set once built: the ad's position in the campaign (0 = first). */
  position?: number;
  /** The words that actually ran, once built. */
  headline?: string | null;
  primaryText?: string | null;
};

export type ExperimentResult = {
  checkedAt: string;
  days: number;
  word: string;
  figures: VariantFigures[];
  verdict: Verdict;
};

export type ExperimentView = {
  id: string;
  status: "PROPOSED" | "APPROVED" | "RUNNING" | "CONCLUDED" | "CANCELED";
  hypothesis: string;
  variants: ExperimentVariant[];
  mairoCampaignId: string | null;
  campaignDraftId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  approvedAt: string | null;
  checkedAt: string | null;
  result: ExperimentResult | null;
  conclusion: string | null;
  decisionId: string | null;
};

const DAY = 86_400_000;

function parseVariants(raw: string): ExperimentVariant[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as ExperimentVariant[]).map((x) => ({ ...x, label: String(x.label ?? "A direction") })) : [];
  } catch {
    return [];
  }
}

function parseResult(raw: string | null): ExperimentResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ExperimentResult;
  } catch {
    return null;
  }
}

type Row = Awaited<ReturnType<typeof db.creativeExperiment.findFirst>> & {};

function toView(r: NonNullable<Row>): ExperimentView {
  return {
    id: r.id,
    status: r.status as ExperimentView["status"],
    hypothesis: r.hypothesis,
    variants: parseVariants(r.variantsJson),
    mairoCampaignId: r.mairoCampaignId,
    campaignDraftId: r.campaignDraftId,
    startsAt: r.startsAt?.toISOString() ?? null,
    endsAt: r.endsAt?.toISOString() ?? null,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    checkedAt: r.checkedAt?.toISOString() ?? null,
    result: parseResult(r.resultJson),
    conclusion: r.conclusion,
    decisionId: r.decisionId,
  };
}

/** This business's tests, newest first. */
export async function listExperiments(organizationId: string): Promise<ExperimentView[]> {
  const rows = await db.creativeExperiment.findMany({ where: { organizationId }, orderBy: { updatedAt: "desc" }, take: 20 });
  return rows.map(toView);
}

/** The test the suggested-ads page shows: the open one, or the latest finished one. */
export async function currentExperiment(organizationId: string): Promise<ExperimentView | null> {
  const open = await db.creativeExperiment.findFirst({ where: { organizationId, status: { in: ["PROPOSED", "APPROVED", "RUNNING"] } }, orderBy: { updatedAt: "desc" } });
  if (open) return toView(open);
  const done = await db.creativeExperiment.findFirst({ where: { organizationId, status: { in: ["CONCLUDED", "CANCELED"] } }, orderBy: { updatedAt: "desc" } });
  return done ? toView(done) : null;
}

/**
 * The owner wants the proposed test run. Only a test whose versions are all
 * still the approved ones can be approved — an ad edited since would mean
 * testing something nobody approved.
 */
export async function approveExperiment(organizationId: string, userId: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.creativeExperiment.findFirst({ where: { id, organizationId } });
  if (!row) return { ok: false, error: "That test isn't in your account." };
  if (row.status !== "PROPOSED") return { ok: false, error: row.status === "CANCELED" ? "That test was stopped." : "That test is already approved." };
  const variants = parseVariants(row.variantsJson);
  if (variants.length < 2) return { ok: false, error: "A test needs two approved ads." };
  if (!(await stillApproved(organizationId, variants))) return { ok: false, error: "One of these ads changed since the test was written. Approve it again and MAIRO updates the test." };
  const claimed = await db.creativeExperiment.updateMany({ where: { id, organizationId, status: "PROPOSED" }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: userId } });
  if (claimed.count === 0) return { ok: false, error: "That test is already approved." };
  return { ok: true };
}

/**
 * Every version is still exactly what the owner approved: an approval on
 * record, for the words the direction has now, with the picture or video it
 * has now — the same test the suggested-ads page uses for "Approved".
 */
async function stillApproved(organizationId: string, variants: ExperimentVariant[]): Promise<boolean> {
  const approvals = await db.creativeApproval.findMany({ where: { organizationId, revokedAt: null, angleRevisionId: { in: variants.map((v) => v.angleRevisionId ?? "") } }, select: { angleId: true, angleRevisionId: true } });
  if (approvals.length < variants.length) return false;
  const views = (await listSuggestions(organizationId)).directions;
  return approvals.every((a) => views.find((d) => d.id === a.angleId)?.approval?.state === "current");
}

/** Stopping a test: before it runs, or while it runs (the campaign itself is untouched). */
export async function cancelExperiment(organizationId: string, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.creativeExperiment.findFirst({ where: { id, organizationId } });
  if (!row) return { ok: false, error: "That test isn't in your account." };
  if (row.status === "CONCLUDED" || row.status === "CANCELED") return { ok: false, error: "That test has already finished." };
  await db.creativeExperiment.updateMany({
    where: { id, organizationId, status: row.status },
    data: { status: "CANCELED", endsAt: new Date(), conclusion: row.status === "RUNNING" ? "You stopped the test. The campaign keeps running as it is — pause it from Campaigns if you want it off." : "You stopped the test before it ran." },
  });
  if (row.campaignDraftId) await db.campaignDraft.deleteMany({ where: { id: row.campaignDraftId, organizationId, step: { not: "BUILDING" } } });
  return { ok: true };
}

/**
 * The test's campaign draft: the first direction's approved picture or video,
 * with both directions' words as separate ads (the builder's "test versions").
 * Made once. Nothing is built in the ad account and nothing spends until the
 * owner launches it from the builder.
 */
export async function draftFromExperiment(organizationId: string, userId: string, id: string): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  const row = await db.creativeExperiment.findFirst({ where: { id, organizationId } });
  if (!row) return { ok: false, error: "That test isn't in your account." };
  if (row.status !== "APPROVED") return { ok: false, error: row.status === "PROPOSED" ? "Approve the test first." : "This test already has its campaign." };
  if (row.campaignDraftId) {
    const still = await db.campaignDraft.findFirst({ where: { id: row.campaignDraftId, organizationId }, select: { id: true } });
    if (still) return { ok: true, draftId: still.id };
  }
  const variants = parseVariants(row.variantsJson);
  const approvals = await db.creativeApproval.findMany({ where: { organizationId, revokedAt: null, angleRevisionId: { in: variants.map((v) => v.angleRevisionId ?? "") } } });
  const ordered = variants.map((v) => approvals.find((a) => a.angleRevisionId === v.angleRevisionId));
  if (ordered.some((a) => !a) || !(await stillApproved(organizationId, variants))) return { ok: false, error: "One of these ads changed since you approved the test. Approve it again and MAIRO updates the test." };

  const first = await planFromApproval(organizationId, ordered[0]!.angleId);
  if (!first.ok) return first;
  const views = (await listSuggestions(organizationId)).directions;
  const others = ordered.slice(1).map((a) => views.find((d) => d.id === a!.angleId));
  if (others.some((o) => !o?.words)) return { ok: false, error: "One of these ads changed since you approved the test. Approve it again and MAIRO updates the test." };

  const base = first.plan.copyOptions[0];
  const copyOptions = [base, ...others.map((o) => ({ primaryText: [o!.words!.hook, o!.words!.body].filter(Boolean).join("\n\n"), headline: base.headline, cta: base.cta, angle: o!.title }))];
  const plan = { ...first.plan, copyOptions, chosenCopy: 0, testing: true, testPicks: copyOptions.map((_, i) => i).slice(1), experimentId: row.id };
  const draft = await db.campaignDraft.create({
    data: { organizationId, createdByUserId: userId, service: "meta", step: "business", label: `Test — ${variants.map((v) => v.label).join(" vs ")}`.slice(0, 120), data: JSON.parse(JSON.stringify(plan)) },
    select: { id: true },
  });
  await db.creativeExperiment.update({ where: { id: row.id }, data: { campaignDraftId: draft.id } });
  return { ok: true, draftId: draft.id };
}

/**
 * Called when a draft becomes a campaign. Records which ad is which version —
 * by position, with the words that actually ran, since the owner may have
 * edited them in the builder — or ends the test if only one ad was built.
 */
export async function linkExperimentCampaign(organizationId: string, draftId: string, mairoCampaignId: string): Promise<void> {
  const row = await db.creativeExperiment.findFirst({ where: { organizationId, campaignDraftId: draftId } });
  if (!row) return;
  const ads = await db.campaignAd.findMany({ where: { mairoCampaignId, mairoCampaign: { organizationId } }, orderBy: { position: "asc" } });
  if (ads.length < 2) {
    await db.creativeExperiment.update({ where: { id: row.id }, data: { status: "CANCELED", campaignDraftId: null, mairoCampaignId, endsAt: new Date(), conclusion: "The campaign was built with one ad, so there was nothing to compare. Turn on test versions in the builder to run the test." } });
    return;
  }
  const variants = parseVariants(row.variantsJson);
  const ran = ads.slice(0, Math.max(2, variants.length)).map((ad, i) => ({
    ...(variants[i] ?? { label: `Version ${i + 1}` }),
    position: ad.position,
    headline: ad.headline,
    primaryText: ad.primaryText,
  }));
  await db.creativeExperiment.update({ where: { id: row.id }, data: { mairoCampaignId, campaignDraftId: null, variantsJson: JSON.stringify(ran) } });
}

/** Campaigns a running test is judging — the daily review leaves their ads to the test. */
export async function campaignsUnderTest(organizationId: string): Promise<Set<string>> {
  const rows = await db.creativeExperiment.findMany({ where: { organizationId, status: { in: ["APPROVED", "RUNNING"] }, mairoCampaignId: { not: null } }, select: { mairoCampaignId: true } });
  return new Set(rows.map((r) => r.mairoCampaignId!));
}

export type CheckDeps = {
  /** Meta's per-ad figures for a campaign since a date. Defaults to the Meta adapter. */
  perAd?: (input: { organizationId: string; externalCampaignId: string; since: Date; until: Date }) => Promise<{ ok: true; data: { externalAdId: string; metrics: PlatformMetrics }[] } | { ok: false; error: string }>;
};

async function metaPerAd(input: { organizationId: string; externalCampaignId: string; since: Date; until: Date }) {
  const adapter = getAdapter("META");
  if (!adapter) return { ok: false as const, error: "Meta isn't available." };
  const r = await adapter.getCreativePerformance({ organizationId: input.organizationId, externalCampaignId: input.externalCampaignId, range: { since: input.since, until: input.until } });
  return r.ok ? { ok: true as const, data: r.data } : { ok: false as const, error: r.error.message };
}

/** The pieces of a verdict the figures need, for the day's check. */
export function figuresFor(objective: AdGoal, variants: ExperimentVariant[], adIds: (string | null)[], perAd: Map<string, PlatformMetrics>): VariantFigures[] {
  return variants.map((v, i) => {
    const id = adIds[v.position ?? i] ?? null;
    const m = id ? perAd.get(id) ?? null : null;
    return { label: v.label, spendCents: m?.spendCents ?? 0, impressions: m?.impressions ?? 0, clicks: m?.clicks ?? 0, results: resultsFor(objective, m) ?? 0 };
  });
}

/**
 * The day's look at one test. A test whose campaign isn't live yet waits; a
 * live one is judged on Meta's figures since it started. A final verdict ends
 * the test, and a winner adds a proposal to switch off the other ad.
 */
export async function checkExperiment(organizationId: string, id: string, now = new Date(), deps: CheckDeps = {}): Promise<{ ok: true; view: ExperimentView } | { ok: false; error: string }> {
  const row = await db.creativeExperiment.findFirst({ where: { id, organizationId } });
  if (!row) return { ok: false, error: "That test isn't in your account." };
  if (row.status !== "APPROVED" && row.status !== "RUNNING") return { ok: true, view: toView(row) };
  if (!row.mairoCampaignId) return { ok: true, view: toView(row) };

  const campaign = await db.mairoCampaign.findFirst({ where: { id: row.mairoCampaignId, organizationId }, include: { platformCampaigns: true } });
  if (!campaign || campaign.status === "ARCHIVED") {
    const updated = await db.creativeExperiment.update({ where: { id: row.id }, data: { status: "CANCELED", endsAt: now, conclusion: "The test's campaign was deleted, so the test stopped." } });
    return { ok: true, view: toView(updated) };
  }

  let startsAt = row.startsAt;
  if (!startsAt) {
    // A test starts when Meta says its campaign is running — not when it was built.
    if (campaign.status !== "ACTIVE") {
      const updated = await db.creativeExperiment.update({ where: { id: row.id }, data: { checkedAt: now } });
      return { ok: true, view: toView(updated) };
    }
    startsAt = now;
    await db.creativeExperiment.update({ where: { id: row.id }, data: { status: "RUNNING", startsAt } });
  }

  const meta = campaign.platformCampaigns.find((p) => p.platform === "META" && p.externalCampaignId);
  if (!meta) return { ok: true, view: toView((await db.creativeExperiment.findFirst({ where: { id: row.id } }))!) };
  const adIds = [meta.externalAdId, ...meta.extraExternalAdIds];
  const read = await (deps.perAd ?? metaPerAd)({ organizationId, externalCampaignId: meta.externalCampaignId!, since: startsAt, until: now });
  if (!read.ok) {
    // A failed read isn't evidence: nothing is recorded but the attempt.
    const updated = await db.creativeExperiment.update({ where: { id: row.id }, data: { checkedAt: now } });
    return { ok: true, view: toView(updated) };
  }

  const variants = parseVariants(row.variantsJson);
  const figures = figuresFor(campaign.objective, variants, adIds, new Map(read.data.map((r) => [r.externalAdId, r.metrics])));
  const days = Math.floor((now.getTime() - startsAt.getTime()) / DAY);
  const word = resultWord(campaign.objective);
  const verdict = judge(figures, days, word);
  const result: ExperimentResult = { checkedAt: now.toISOString(), days, word, figures, verdict };

  if (!verdict.final) {
    const updated = await db.creativeExperiment.update({ where: { id: row.id }, data: { status: "RUNNING", checkedAt: now, resultJson: JSON.stringify(result) } });
    return { ok: true, view: toView(updated) };
  }

  const conclusion = `${verdict.headline}. ${verdict.detail}`;
  // Concluded once, even if two checks overlap.
  const closed = await db.creativeExperiment.updateMany({ where: { id: row.id, status: "RUNNING" }, data: { status: "CONCLUDED", endsAt: now, checkedAt: now, resultJson: JSON.stringify(result), conclusion } });
  if (closed.count > 0 && verdict.kind === "winner") {
    const ids = await proposeSwitchOff(organizationId, row.id, campaign, verdict, figures, word, variants, adIds);
    if (ids[0]) await db.creativeExperiment.update({ where: { id: row.id }, data: { decisionId: ids[0] } });
  }
  return { ok: true, view: toView((await db.creativeExperiment.findFirst({ where: { id: row.id } }))!) };
}

/** The winner's evidence, as a decision the owner approves or declines. Never applied by the test. */
async function proposeSwitchOff(
  organizationId: string,
  experimentId: string,
  campaign: { id: string; name: string },
  verdict: Extract<Verdict, { kind: "winner" }>,
  figures: VariantFigures[],
  word: string,
  variants: ExperimentVariant[],
  adIds: (string | null)[],
): Promise<string[]> {
  const winner = figures[verdict.winner];
  const changes = verdict.losers
    .map((i) => ({ i, id: adIds[variants[i]?.position ?? i] }))
    .filter((x): x is { i: number; id: string } => Boolean(x.id))
    .map(({ i, id }) => ({ type: "pause-ad" as const, platform: "META" as const, mairoCampaignId: campaign.id, externalAdId: id, adLabel: figures[i].label, campaignName: campaign.name }));
  if (!changes.length) return [];
  const cpr = (v: VariantFigures) => (v.results > 0 ? usd(Math.round(v.spendCents / v.results)) : "—");
  return persistDrafts(organizationId, [
    {
      kind: "pause-ad",
      category: "CREATIVE",
      urgent: false,
      mairoCampaignId: campaign.id,
      platform: "META",
      title: `Test result: ${winner.label} wins in "${campaign.name}"`,
      noticed: verdict.detail,
      noticedAdvanced: figures.map((f) => `${f.label}: ${f.results} ${word}s, ${usd(f.spendCents)} spend, ${cpr(f)} per ${word}`).join(" · "),
      whyItMatters: `The test met MAIRO's evidence rules: at least ${EVIDENCE.minDays} days, ${EVIDENCE.minResultsTotal}+ ${word}s, and a gap that chance is unlikely to explain.`,
      recommendation: `Switch off ${changes.map((c) => c.adLabel).join(" and ")} so the budget goes to ${winner.label}. You can switch it back on at any time.`,
      impact: `More of this campaign's budget goes to the version bringing in ${word}s for less.`,
      risk: "LOW",
      confidence: "HIGH",
      evidence: figures.map((f) => ({ label: `${f.label}: ${word}s · cost each`, value: `${f.results} · ${cpr(f)}` })),
      changes,
      dedupeKey: `experiment:${experimentId}:switch-off`,
      priority: 85,
    },
  ]);
}

/** Every open test, for the daily review. */
export async function checkAllExperiments(now = new Date(), budgetMs = 30_000): Promise<{ checked: number; concluded: number }> {
  const started = Date.now();
  const rows = await db.creativeExperiment.findMany({ where: { status: { in: ["APPROVED", "RUNNING"] }, mairoCampaignId: { not: null } }, select: { id: true, organizationId: true }, take: 200 });
  let checked = 0;
  let concluded = 0;
  for (const r of rows) {
    if (Date.now() - started > budgetMs) break;
    const res = await checkExperiment(r.organizationId, r.id, now).catch((error) => {
      console.error("Checking a creative test failed:", error instanceof Error ? error.message : error);
      return null;
    });
    checked++;
    if (res?.ok && res.view.status === "CONCLUDED") concluded++;
  }
  return { checked, concluded };
}
