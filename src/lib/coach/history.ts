import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import { parseChanges } from "@/lib/decisions/store";
import { measureNow } from "./diagnose";
import { judge, judgeChange, measureNote, NOT_PROOF } from "./verdict";
import type { CoachInput, Measure, MetricKey } from "./types";

// The optimization history: what followed each change MAIRO carried out, and
// whether an approved plan's figure moved. Measured over the same number of
// days before and after, only once enough time has passed, and written down
// as what followed — never as proof of cause.

const DAY = 86_400_000;
/** How long after a change before it's compared. */
export const COMPARE_AFTER_DAYS = 14;

const LABEL: Record<MetricKey, string> = {
  medianResponseHours: "The typical time to first contact",
  waitingForContact: "The number of leads waiting over a day",
  qualifiedShare: "The share of good leads",
  appointmentShare: "The share of good leads that booked",
  stalledEstimates: "The number of estimates waiting two weeks",
  costPerQualified: "The cost per good lead",
  costPerLead: "The cost per lead",
  clickToLead: "The share of clicks that became leads",
  ctr: "Clicks per view",
  cpm: "The cost per thousand views",
};

function show(metric: MetricKey, v: number): string {
  switch (metric) {
    case "medianResponseHours":
      return v >= 48 ? `${Math.round(v / 24)} days` : `${Math.round(v)} hours`;
    case "qualifiedShare":
    case "appointmentShare":
    case "clickToLead":
      return `${Math.round(v * 100)}%`;
    case "ctr":
      return `${(v * 100).toFixed(2)}%`;
    case "costPerQualified":
    case "costPerLead":
    case "cpm":
      return (v / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
    default:
      return String(Math.round(v));
  }
}

/** Approved plans whose check date has come: re-measure their figure the way it was first measured. */
export async function judgeApprovedPlans(organizationId: string, input: CoachInput): Promise<{ id: string; title: string; verdict: string; note: string }[]> {
  const due = await db.coachFinding.findMany({ where: { organizationId, status: "APPROVED", verdict: null, checkAfter: { lte: input.now } }, take: 10 });
  const out: { id: string; title: string; verdict: string; note: string }[] = [];
  for (const f of due) {
    let m: Measure | null = null;
    try {
      m = f.measureJson ? (JSON.parse(f.measureJson) as Measure) : null;
    } catch {
      m = null;
    }
    if (!m) continue;
    const now = measureNow(input, m);
    const verdict = judge(m.value, now?.value ?? null, m.betterWhen, now?.enough ?? false);
    const note = measureNote(verdict, LABEL[m.metric], show(m.metric, m.value), now ? show(m.metric, now.value) : null);
    // Not enough yet: look again in a week rather than settling on "unknown".
    if (verdict === "NOT_MEASURABLE" && input.now.getTime() - (f.decidedAt ?? f.createdAt).getTime() < 45 * DAY) {
      await db.coachFinding.updateMany({ where: { id: f.id, organizationId }, data: { checkAfter: new Date(input.now.getTime() + 7 * DAY) } });
      continue;
    }
    await db.coachFinding.updateMany({
      where: { id: f.id, organizationId, status: "APPROVED" },
      data: { verdict, verdictNote: note, verdictAt: input.now, ...(verdict === "IMPROVED" ? { status: "RESOLVED", resolvedAt: input.now } : {}) },
    });
    out.push({ id: f.id, title: f.title, verdict, note });
  }
  return out;
}

/**
 * Changes carried out on Meta at least two weeks ago and not yet compared:
 * the campaign's cost per result over the two weeks before against the two
 * weeks after. A few per review, to keep Meta reads small.
 */
export async function judgeAppliedChanges(organizationId: string, now = new Date(), limit = 3): Promise<{ id: string; title: string; verdict: string; note: string }[]> {
  const due = await db.mairoDecision.findMany({
    where: { organizationId, status: "APPLIED", verdict: null, decidedAt: { lte: new Date(now.getTime() - COMPARE_AFTER_DAYS * DAY), gte: new Date(now.getTime() - 90 * DAY) } },
    orderBy: { decidedAt: "asc" },
    take: limit,
  });
  const out: { id: string; title: string; verdict: string; note: string }[] = [];
  for (const d of due) {
    const at = d.decidedAt!;
    const change = parseChanges(d.changesJson).find((c) => "externalCampaignId" in c && "mairoCampaignId" in c) as { platform: string; externalCampaignId: string; mairoCampaignId: string } | undefined;
    const campaign = change ? await db.mairoCampaign.findFirst({ where: { id: change.mairoCampaignId, organizationId }, select: { objective: true } }) : null;
    const adapter = change ? getAdapter(change.platform as never) : null;
    if (!change || !campaign || !adapter) {
      await db.mairoDecision.updateMany({ where: { id: d.id, organizationId }, data: { verdict: "NOT_MEASURABLE", verdictNote: "This change can't be compared by campaign results.", verdictAt: now } });
      continue;
    }
    const dayStart = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
    const before = { since: new Date(dayStart - COMPARE_AFTER_DAYS * DAY), until: new Date(dayStart - DAY) };
    const after = { since: new Date(dayStart + DAY), until: new Date(dayStart + COMPARE_AFTER_DAYS * DAY) };
    const [b, a] = await Promise.all([
      adapter.getCampaignPerformance({ organizationId, externalCampaignIds: [change.externalCampaignId], range: before }),
      adapter.getCampaignPerformance({ organizationId, externalCampaignIds: [change.externalCampaignId], range: after }),
    ]);
    if (!b.ok || !a.ok) continue; // Meta didn't answer: try again at the next review.
    const result = judgeChange(campaign.objective, b.data[0]?.metrics ?? null, a.data[0]?.metrics ?? null);
    await db.mairoDecision.updateMany({
      where: { id: d.id, organizationId },
      data: { verdict: result.verdict, verdictNote: result.note, verdictJson: JSON.stringify({ windows: { before, after }, ...result.figures }), verdictAt: now },
    });
    out.push({ id: d.id, title: d.title, verdict: result.verdict, note: result.note });
  }
  return out;
}

export { NOT_PROOF };
