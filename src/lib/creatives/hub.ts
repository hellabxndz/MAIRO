import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { activeMission } from "@/lib/mission/store";
import { missionGoal, type MetricFamily } from "@/lib/mission/goals";
import { libraryFor } from "@/lib/creative-studio/library";
import { familyFor, goalLabel, statusLabel } from "@/lib/dashboard/campaigns";
import { money } from "@/lib/dashboard/home";

// Everything about a business's creatives, for the one Creatives page:
// what's running (Active), what MAIRO made that isn't running yet (New),
// what ran before (Past), and what has worked best for the business's goal
// (Top Performing) — ranked by purchases for a sales goal, leads for a leads
// goal, never by likes or clicks when the goal is sales.

const DAY = 86_400_000;

/** The number that counts for a goal, from an ad's own figures. */
export function goalResults(family: MetricFamily, m: PlatformMetrics | null): number | null {
  if (!m) return null;
  switch (family) {
    case "sales":
      return m.purchases ?? m.conversions;
    case "leads":
      return m.leads ?? m.conversions;
    case "bookings":
      return m.bookings ?? m.leads ?? null;
    case "calls":
      return m.contacts ?? null;
    case "traffic":
      return m.landingPageViews ?? m.clicks;
    case "awareness":
    case "visits":
      return m.reach;
    case "social":
      return m.engagement ?? null;
  }
}

const WORD: Record<MetricFamily, [string, string]> = {
  sales: ["purchase", "purchases"],
  leads: ["lead", "leads"],
  bookings: ["booking", "bookings"],
  calls: ["call or message", "calls and messages"],
  traffic: ["website visit", "website visits"],
  awareness: ["person reached", "people reached"],
  visits: ["person reached", "people reached"],
  social: ["engagement", "engagements"],
};

export function resultPhrase(family: MetricFamily, n: number | null): string {
  if (n === null) return "No results yet";
  return `${Math.round(n).toLocaleString("en-US")} ${n === 1 ? WORD[family][0] : WORD[family][1]}`;
}

export type HubAd = {
  id: string;
  name: string;
  kind: "IMAGE" | "VIDEO" | "EXISTING_AD";
  preview: string | null;
  headline: string | null;
  primaryText: string | null;
  cta: string | null;
  reason: string | null;
  campaignId: string;
  campaignName: string;
  status: string;
  goal: string;
  family: MetricFamily;
  results: number | null;
  spendCents: number | null;
  costPerResultCents: number | null;
  resultText: string;
  date: string;
};

/**
 * Top performing, by the goal: the most results at the lowest cost per
 * result. Ads with no result for the goal aren't ranked at all.
 */
export function rankByGoal(ads: HubAd[], limit = 6): HubAd[] {
  return ads
    .filter((a) => (a.results ?? 0) > 0 && (a.spendCents ?? 0) > 0)
    .sort((a, b) => (a.costPerResultCents ?? Infinity) - (b.costPerResultCents ?? Infinity) || (b.results ?? 0) - (a.results ?? 0))
    .slice(0, limit);
}

export type NewItem = {
  key: string;
  kind: "request" | "studio";
  id: string;
  title: string;
  preview: string | null;
  status: "Ready to review" | "Approved" | "Draft" | "Being checked" | "Ready to use";
  date: string;
  hasConcept: boolean;
};

export async function loadCreativeHub(organizationId: string, now = new Date()) {
  const [mission, campaigns, requests, library] = await Promise.all([
    activeMission(organizationId),
    db.mairoCampaign.findMany({
      where: { organizationId, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { ads: { orderBy: { position: "asc" } }, platformCampaigns: { select: { platform: true, externalCampaignId: true, externalAdId: true, extraExternalAdIds: true } } },
    }),
    db.creativeRequest.findMany({
      where: { organizationId, status: { not: "BLOCKED" } },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, brief: true, status: true, aiConcept: true, createdAt: true, images: { where: { isFinal: true }, select: { id: true }, take: 1 } },
    }),
    libraryFor(organizationId, 40).catch(() => []),
  ]);
  const goalFamily = mission ? missionGoal(mission.primaryGoal).metrics : null;

  // Per-ad figures, last 90 days, for the most recent campaigns that reached Meta.
  const figures = new Map<string, PlatformMetrics>();
  const since = new Date(now.getTime() - 90 * DAY);
  await Promise.all(
    campaigns
      .flatMap((c) => c.platformCampaigns.filter((p) => p.externalCampaignId).map((p) => ({ c, p })))
      .slice(0, 12)
      .map(async ({ p }) => {
        const adapter = getAdapter(p.platform);
        if (!adapter) return;
        const res = await adapter.getCreativePerformance({ organizationId, externalCampaignId: p.externalCampaignId!, range: { since, until: now } }).catch(() => null);
        if (res?.ok) for (const row of res.data) figures.set(row.externalAdId, row.metrics);
      }),
  );

  // A creative request's picture, where MAIRO can serve one lightly.
  const studioByRequest = new Map(library.filter((l) => l.linkedCreativeRequestId && l.latestVersion?.imageUrl).map((l) => [l.linkedCreativeRequestId!, l.latestVersion!.imageUrl!]));
  const finalImage = new Map(requests.filter((r) => r.images[0]).map((r) => [r.id, `/api/creatives/${r.images[0].id}/raw`]));
  const used = new Set<string>();

  const ads: (HubAd & { tab: "active" | "past" })[] = [];
  for (const c of campaigns) {
    const s = statusLabel(c, now);
    const family = goalFamily ?? familyFor(c.objective, c.destinationType);
    const meta = c.platformCampaigns.find((p) => p.platform === "META");
    const externalIds = meta ? [meta.externalAdId, ...meta.extraExternalAdIds] : [];
    c.ads.forEach((ad, i) => {
      if (ad.creativeRequestId) used.add(ad.creativeRequestId);
      const m = externalIds[i] ? figures.get(externalIds[i]!) ?? null : null;
      const results = goalResults(family, m);
      const spend = m?.spendCents ?? null;
      let reason: string | null = null;
      try {
        reason = ad.briefJson ? (JSON.parse(ad.briefJson) as { reason?: string }).reason ?? null : null;
      } catch {
        reason = null;
      }
      ads.push({
        tab: c.status === "ACTIVE" || c.status === "PENDING_REVIEW" ? (c.endDate && c.endDate < now ? "past" : "active") : "past",
        id: ad.id,
        name: ad.headline || ad.sourceAdName || `${c.name} — ad ${i + 1}`,
        kind: ad.kind,
        preview: ad.imageUrl ?? ad.videoPosterUrl ?? (ad.creativeRequestId ? (studioByRequest.get(ad.creativeRequestId) ?? finalImage.get(ad.creativeRequestId) ?? null) : null),
        headline: ad.headline,
        primaryText: ad.primaryText,
        cta: ad.callToAction,
        reason,
        campaignId: c.id,
        campaignName: c.name,
        status: s.text,
        goal: goalLabel(c.objective).replace(/^Get More |^Get Your |^Find /, ""),
        family,
        results,
        spendCents: spend,
        costPerResultCents: results && spend ? Math.round(spend / results) : null,
        resultText: resultPhrase(family, results),
        date: (c.startDate ?? c.createdAt).toISOString().slice(0, 10),
      });
    });
  }

  const newItems: NewItem[] = [
    ...requests
      .filter((r) => !used.has(r.id))
      .map((r): NewItem => ({
        key: `r-${r.id}`,
        kind: "request",
        id: r.id,
        title: r.brief.slice(0, 90) || "Creative",
        preview: studioByRequest.get(r.id) ?? finalImage.get(r.id) ?? null,
        status: r.status === "APPROVED" ? (r.images[0] ? "Approved" : "Ready to review") : r.status === "DELIVERED" ? "Approved" : r.status === "IN_REVIEW" ? "Being checked" : "Draft",
        date: r.createdAt.toISOString().slice(0, 10),
        hasConcept: Boolean(r.aiConcept),
      })),
    ...library
      .filter((l) => !l.linkedCreativeRequestId && l.latestVersion?.status === "COMPLETE" && l.latestVersion.imageUrl)
      .map((l): NewItem => ({
        key: `s-${l.assetId}`,
        kind: "studio",
        id: l.assetId,
        title: l.latestVersion?.instruction?.slice(0, 90) || "Creative Studio image",
        preview: l.latestVersion!.imageUrl,
        status: "Ready to use",
        date: l.updatedAt.toISOString().slice(0, 10),
        hasConcept: true,
      })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const active = ads.filter((a) => a.tab === "active");
  const past = ads.filter((a) => a.tab === "past");
  const family: MetricFamily = goalFamily ?? active[0]?.family ?? past[0]?.family ?? "sales";
  return { active, past, newItems, top: rankByGoal([...active, ...past]), family, goal: mission ? missionGoal(mission.primaryGoal).label : null };
}

export { money };
