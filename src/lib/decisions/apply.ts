import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import { addCampaignAd, metaTargetingForCampaign } from "@/lib/campaigns/launch";
import { writeAdCopyOptions } from "@/lib/ai/ad-copy";
import { brainFacts, loadBrain } from "@/lib/business/brain";
import { recordActivity } from "@/lib/activity/log";
import { notify } from "@/lib/notifications/notify";
import { describeChange, limitProblem } from "./guardrails";
import { guardrailsFor } from "./gather";
import type { DecisionChange } from "./types";
import { parseChanges } from "./store";

// Carrying out a decision.
//
// Every change goes to the network first and is written down only once the
// network accepted it — the activity log never describes a change that didn't
// happen. Changes run in a safe order (budget cuts before raises), and the
// first refusal stops the rest, so a decision is never left more than one
// change deep in a state nobody chose.

export type AppliedChange = {
  label: string;
  before: string | null;
  after: string | null;
  ok: boolean;
  error: string | null;
};

export type ApplyOutcome =
  | { ok: true; applied: AppliedChange[]; partial: boolean }
  | { ok: false; error: string; applied: AppliedChange[] };

/** Budget cuts first, so the account never spends more mid-change than before or after. */
function safeOrder(changes: DecisionChange[]): DecisionChange[] {
  const rank = (c: DecisionChange) =>
    c.type === "set-budget" ? (c.toCents < c.fromCents ? 0 : 2) : c.type === "pause-ad" ? 1 : 3;
  return [...changes].sort((a, b) => rank(a) - rank(b));
}

/**
 * The customer may edit amounts in "Edit changes", never what is changed.
 * An edited list has to name the same things in the same way.
 */
export function editsAllowed(original: DecisionChange[], edited: DecisionChange[]): boolean {
  if (original.length !== edited.length) return false;
  return original.every((o, i) => {
    const e = edited[i];
    if (o.type !== e.type) return false;
    if (o.type === "set-budget" && e.type === "set-budget") {
      return o.platformCampaignId === e.platformCampaignId && o.fromCents === e.fromCents && Number.isInteger(e.toCents) && e.toCents > 0;
    }
    if (o.type === "widen-audience" && e.type === "widen-audience") {
      const t = e.to;
      return (
        o.mairoCampaignId === e.mairoCampaignId &&
        t.ageMin >= 18 && t.ageMax <= 65 && t.ageMin <= t.ageMax &&
        (t.geoRadius === null ? o.to.geoRadius === null : t.geoRadius >= 1 && t.geoRadius <= 50)
      );
    }
    return JSON.stringify(o) === JSON.stringify(e);
  });
}

async function runChange(organizationId: string, c: DecisionChange): Promise<{ ok: true } | { ok: false; error: string }> {
  switch (c.type) {
    case "guide":
      return { ok: true };

    case "set-budget": {
      const adapter = getAdapter(c.platform);
      if (!adapter) return { ok: false, error: "MAIRO can't change budgets on that network." };
      const res = await adapter.updateBudget({ organizationId, externalCampaignId: c.externalCampaignId, dailyBudgetCents: c.toCents });
      if (!res.ok) return { ok: false, error: res.error.message };
      const child = await db.platformCampaign.update({
        where: { id: c.platformCampaignId },
        data: { dailyBudgetCents: c.toCents },
        select: { mairoCampaignId: true },
      });
      const siblings = await db.platformCampaign.findMany({ where: { mairoCampaignId: child.mairoCampaignId } });
      await db.mairoCampaign.update({
        where: { id: child.mairoCampaignId },
        data: { totalDailyBudgetCents: siblings.reduce((n, s) => n + s.dailyBudgetCents, 0) },
      });
      return { ok: true };
    }

    case "pause-ad": {
      const adapter = getAdapter(c.platform);
      if (!adapter?.pauseAd) return { ok: false, error: "That network doesn't let MAIRO pause single ads." };
      const res = await adapter.pauseAd({ organizationId, externalAdId: c.externalAdId });
      return res.ok ? { ok: true } : { ok: false, error: res.error.message };
    }

    case "widen-audience": {
      const adapter = getAdapter(c.platform);
      const child = await db.platformCampaign.findUnique({
        where: { mairoCampaignId_platform: { mairoCampaignId: c.mairoCampaignId, platform: c.platform } },
      });
      if (!adapter?.updateAdGroupTargeting || !child?.externalAdGroupId) {
        return { ok: false, error: "MAIRO can't change this campaign's audience on that network." };
      }
      // Stored first so the targeting is built from the new answer by the
      // same function the launch uses — and put back if the network refuses.
      const previous = await db.mairoCampaign.findUnique({
        where: { id: c.mairoCampaignId },
        select: { geoRadius: true, ageMin: true, ageMax: true },
      });
      await db.mairoCampaign.update({
        where: { id: c.mairoCampaignId },
        data: { ...(c.to.geoRadius !== null ? { geoRadius: c.to.geoRadius } : {}), ageMin: c.to.ageMin, ageMax: c.to.ageMax },
      });
      const spec = await metaTargetingForCampaign(c.mairoCampaignId, child.id);
      const res = await adapter.updateAdGroupTargeting({
        organizationId,
        externalAdGroupId: child.externalAdGroupId,
        targeting: spec.targeting,
        advantageAudience: spec.advantageAudience,
      });
      if (!res.ok) {
        if (previous) await db.mairoCampaign.update({ where: { id: c.mairoCampaignId }, data: previous });
        return { ok: false, error: res.error.message };
      }
      return { ok: true };
    }

    case "new-ad-variation": {
      const [based, campaign, brain, positions] = await Promise.all([
        db.campaignAd.findUnique({ where: { id: c.basedOnCampaignAdId } }),
        db.mairoCampaign.findUnique({
          where: { id: c.mairoCampaignId },
          select: { name: true, objective: true, destinationType: true, destinationUrl: true, promotes: true, organization: { select: { name: true, website: true } } },
        }),
        loadBrain(organizationId),
        db.campaignAd.aggregate({ where: { mairoCampaignId: c.mairoCampaignId }, _max: { position: true } }),
      ]);
      if (!based || !campaign || based.mairoCampaignId !== c.mairoCampaignId) {
        return { ok: false, error: "The ad this was based on is gone." };
      }
      const facts = brainFacts(brain.profile);
      let versions;
      try {
        versions = await writeAdCopyOptions({
          businessName: campaign.organization.name,
          offering: facts.offering,
          targetAudience: facts.targetAudience,
          differentiator: [facts.differentiator, facts.voice ? `Brand voice: ${facts.voice}` : ""].filter(Boolean).join(". "),
          advertising: `A fresh version of an ad that has been running. Current headline: "${based.headline ?? ""}". Current text: "${based.primaryText ?? ""}". Write new angles — do not repeat these.`,
          goal: campaign.objective,
          destination: campaign.destinationType,
          website: campaign.destinationUrl ?? campaign.organization.website ?? "",
          imageUrl: based.imageUrl ?? based.videoPosterUrl ?? null,
        });
      } catch {
        return { ok: false, error: "MAIRO couldn't write the new version just now. Nothing was changed." };
      }
      const fresh = versions.find(
        (v) => v.headline.trim() !== (based.headline ?? "").trim() && v.primaryText.trim() !== (based.primaryText ?? "").trim(),
      );
      if (!fresh) return { ok: false, error: "MAIRO couldn't write a version different enough to test. Nothing was changed." };

      const row = await db.campaignAd.create({
        data: {
          mairoCampaignId: c.mairoCampaignId,
          position: (positions._max.position ?? 0) + 1,
          kind: based.kind,
          creativeRequestId: based.creativeRequestId,
          imageUrl: based.imageUrl,
          videoUrl: based.videoUrl,
          videoPosterUrl: based.videoPosterUrl,
          metaVideoId: based.metaVideoId,
          headline: fresh.headline,
          primaryText: fresh.primaryText,
          callToAction: fresh.cta,
        },
      });
      const res = await addCampaignAd({ organizationId, mairoCampaignId: c.mairoCampaignId, platform: c.platform, campaignAdId: row.id });
      if (!res.ok) {
        await db.campaignAd.delete({ where: { id: row.id } });
        return { ok: false, error: res.error };
      }
      return { ok: true };
    }
  }
}

/**
 * Carries out a pending decision.
 *
 * `userId` is who approved it; null with `automatic` when MAIRO did it within
 * its automation level. `edited` replaces the changes when the customer
 * adjusted amounts in "Edit changes" — checked to name the same things.
 */
export async function applyDecision(input: {
  organizationId: string;
  decisionId: string;
  userId: string | null;
  automatic: boolean;
  edited?: DecisionChange[];
}): Promise<ApplyOutcome> {
  const decision = await db.mairoDecision.findUnique({ where: { id: input.decisionId } });
  if (!decision || decision.organizationId !== input.organizationId) {
    return { ok: false, error: "That decision is no longer available.", applied: [] };
  }
  if (decision.status !== "PENDING" && decision.status !== "FAILED") {
    return { ok: false, error: "That decision has already been dealt with.", applied: [] };
  }

  const original = parseChanges(decision.changesJson);
  if (input.edited && !editsAllowed(original, input.edited)) {
    return { ok: false, error: "Those edits change what the decision does. Only amounts can be adjusted.", applied: [] };
  }
  const changes = input.edited ?? original;

  // The customer's limits hold even for a change they approved themselves.
  const [guardrails, running] = await Promise.all([
    guardrailsFor(input.organizationId),
    db.mairoCampaign.aggregate({
      where: { organizationId: input.organizationId, status: "ACTIVE" },
      _sum: { totalDailyBudgetCents: true },
    }),
  ]);
  const problem = limitProblem(changes, guardrails, running._sum.totalDailyBudgetCents ?? 0);
  if (problem) return { ok: false, error: problem, applied: [] };

  const applied: AppliedChange[] = [];
  let failure: string | null = null;
  for (const change of safeOrder(changes)) {
    const d = describeChange(change);
    const res = await runChange(input.organizationId, change);
    if (!res.ok) {
      applied.push({ ...d, ok: false, error: res.error });
      failure = res.error;
      break;
    }
    applied.push({ ...d, ok: true, error: null });
    if (change.type !== "guide") {
      await recordActivity({
        organizationId: input.organizationId,
        mairoCampaignId: "mairoCampaignId" in change ? change.mairoCampaignId : decision.mairoCampaignId,
        decisionId: decision.id,
        action: actionLabel(change),
        summary: summaryOf(change),
        reason: decision.noticed,
        before: d.before,
        after: d.after,
        automatic: input.automatic,
        actorUserId: input.userId,
      });
    }
  }

  const anyApplied = applied.some((a) => a.ok);
  await db.mairoDecision.update({
    where: { id: decision.id },
    data: {
      status: failure && !anyApplied ? "FAILED" : "APPLIED",
      decidedAt: new Date(),
      decidedById: input.userId,
      automatic: input.automatic,
      resultJson: JSON.stringify(applied),
      ...(input.edited ? { changesJson: JSON.stringify(input.edited) } : {}),
    },
  });

  if (input.automatic && anyApplied) {
    await notify({
      organizationId: input.organizationId,
      kind: "MAIRO_ACTED",
      dedupeKey: `decision:${decision.id}`,
      title: `MAIRO made ${applied.filter((a) => a.ok).length === 1 ? "a change" : `${applied.filter((a) => a.ok).length} changes`}: ${decision.title}`,
      body: `${decision.recommendation} Every change is in Mairo Activity, with the reason.`,
      actionLabel: "See what changed",
      actionHref: "/dashboard/activity",
      mairoCampaignId: decision.mairoCampaignId ?? undefined,
    }).catch(() => undefined);
  }

  if (failure && !anyApplied) return { ok: false, error: failure, applied };
  return { ok: true, applied, partial: Boolean(failure) };
}

function actionLabel(c: DecisionChange): string {
  switch (c.type) {
    case "set-budget":
      return c.toCents > c.fromCents ? "Raised a budget" : "Lowered a budget";
    case "pause-ad":
      return "Paused an ad";
    case "new-ad-variation":
      return "Added a new ad version";
    case "widen-audience":
      return "Widened an audience";
    case "guide":
      return "Pointed you to a fix";
  }
}

function summaryOf(c: DecisionChange): string {
  const d = describeChange(c);
  switch (c.type) {
    case "set-budget":
      return `MAIRO changed ${c.campaignName} from ${d.before} to ${d.after}.`;
    case "pause-ad":
      return `MAIRO paused ${c.adLabel} in ${c.campaignName}.`;
    case "new-ad-variation":
      return `MAIRO added a new version of ${c.basedOnLabel} to ${c.campaignName}.`;
    case "widen-audience":
      return `MAIRO widened who ${c.campaignName} reaches: ${d.before} → ${d.after}.`;
    case "guide":
      return c.label;
  }
}
