import { recordRun } from "@/lib/team/runs";
import { agentForDecision } from "@/lib/team/agents";
import { db } from "@/lib/db";
import { brainPromptFor } from "@/lib/brain/store";
import { getAdapter } from "@/lib/ad-platforms/registry";
import { addCampaignAd, metaTargetingForCampaign } from "@/lib/campaigns/launch";
import { writeAdCopyOptions } from "@/lib/ai/ad-copy";
import { brainFacts, loadBrain } from "@/lib/business/brain";
import { recordActivity } from "@/lib/activity/log";
import { notify } from "@/lib/notifications/notify";
import { describeChange, limitProblem } from "./guardrails";
import { guardrailsFor } from "./gather";
import type { DecisionChange } from "./types";
import { learningsBrief } from "@/lib/reports/learnings";
import { parseChanges } from "./store";
import { variationBrief } from "@/lib/engine/brief";

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

    case "try-meta-feature":
      // Consent for the next campaign only. Live campaigns stay as they are.
      await db.platformFeatureOptIn.upsert({
        where: { platform_organizationId_featureKey: { platform: "META", organizationId, featureKey: c.featureKey } },
        create: { platform: "META", organizationId, featureKey: c.featureKey, status: "APPROVED" },
        update: { status: "APPROVED", decidedAt: new Date() },
      });
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
          differentiator: [facts.differentiator, facts.voice ? `Brand voice: ${facts.voice}` : "", await learningsBrief(organizationId)].filter(Boolean).join(". "),
          advertising: `A fresh version of an ad that has been running. Current headline: "${based.headline ?? ""}". Current text: "${based.primaryText ?? ""}". Write new angles — do not repeat these.`,
          goal: campaign.objective,
          destination: campaign.destinationType,
          website: campaign.destinationUrl ?? campaign.organization.website ?? "",
          imageUrl: based.imageUrl ?? based.videoPosterUrl ?? null,
          brain: await brainPromptFor(organizationId).catch(() => undefined),
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
          briefJson: variationBrief(based.briefJson, fresh, c.basedOnLabel),
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

  // Claim it before anything reaches Meta. Checking the status above isn't
  // enough on its own: a double click, a second tab, or MAIRO's automatic
  // run landing at the same moment as a person's approval would all pass
  // that check together, and each would send the change — two new ads where
  // one was approved, every line in Activity twice. Only one of them can move
  // applyingAt from empty; the others stop here. It's a lease, so an approval
  // that died half-way frees the decision after a couple of minutes.
  const claim = await db.mairoDecision.updateMany({
    where: {
      id: decision.id,
      organizationId: input.organizationId,
      status: { in: ["PENDING", "FAILED"] },
      OR: [{ applyingAt: null }, { applyingAt: { lt: new Date(Date.now() - APPLY_LEASE_MS) } }],
    },
    data: { applyingAt: new Date() },
  });
  if (claim.count === 0) {
    return { ok: false, error: "MAIRO is already making this change. It will show in Mairo Activity in a moment.", applied: [] };
  }

  try {
    return await carryOut(input, decision, changes);
  } finally {
    // Released whatever happened. On success the status has already moved
    // on, so nothing can claim it again; after an error it can be retried.
    await db.mairoDecision.update({ where: { id: decision.id }, data: { applyingAt: null } }).catch(() => undefined);
  }
}

/** How long an approval in progress holds a decision before another may try. */
export const APPLY_LEASE_MS = 2 * 60_000;

async function carryOut(
  input: { organizationId: string; userId: string | null; automatic: boolean; edited?: DecisionChange[] },
  decision: NonNullable<Awaited<ReturnType<typeof db.mairoDecision.findUnique>>>,
  changes: DecisionChange[],
): Promise<ApplyOutcome> {
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

  // The team's record of an approval it carried out — only for what Meta
  // accepted. (MAIRO's own automatic changes are recorded by the daily
  // review that made them.) A budget change was checked against the
  // customer's limits above, before anything ran: that's the Guardian's part.
  if (!input.automatic && anyApplied) {
    const owner = agentForDecision(decision.kind, decision.category);
    if (changes.some((c) => c.type === "set-budget")) {
      await recordRun({ organizationId: input.organizationId, agent: "GUARDIAN", task: "check-approval", status: "DONE", summary: `Checked “${decision.title}” against your spending limits before it ran — within them.`, decisionId: decision.id });
    }
    await recordRun({
      organizationId: input.organizationId,
      agent: owner,
      task: "apply-approved",
      status: "DONE",
      summary: `${failure ? "Partly carried out" : "Carried out"} your approval on Meta: ${decision.title}`,
      href: "/dashboard/activity",
      decisionId: decision.id,
    });
  }

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
    case "try-meta-feature":
      return "Approved a new Meta capability";
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
    case "try-meta-feature":
      return `You approved MAIRO considering ${c.featureName} in your next campaign. Your running campaigns weren't changed.`;
    case "guide":
      return c.label;
  }
}
