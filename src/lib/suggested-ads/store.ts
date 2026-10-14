import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { brandRulesFor, loadBrainState } from "@/lib/brain/store";
import { brandCheck, type BrandRules } from "@/lib/brain/brand-check";
import { loadMetaConnection } from "@/lib/meta/connection";
import { checkCopy } from "@/lib/campaigns/ad-copy";
import { newPlan, type CampaignPlan } from "@/lib/campaigns/plan";
import { attachAssetToCampaign } from "@/lib/creative-studio/campaign-link";
import { trackingOverview } from "@/lib/tracking/setup";
import { audienceFor, buildDirections, ctaTypeFor, destinationFor, introFor, recommendedWhyFor, TEST_REASON, usesAvoided, type ConfirmedFacts } from "./directions";
import type { HookAngle } from "@/lib/creative/hooks";
import { NO_EDITS, describeEdits, parseEdits, sameEdits, type VideoEdits, type VideoMeta } from "./video";
import { isOwnUpload } from "@/lib/campaigns/media-rules";
import { localMedia } from "./render-run";

// The records behind "Review your suggested ads", one business at a time:
// directions (AdAngle) with every revision kept, the pictures made for them
// (Creative Studio assets carrying the direction's id), the owner's videos
// with every edit kept, and approvals bound to the exact words and media.
//
// Every read and write is scoped to the organization passed in; ids from the
// browser are only ever looked up together with it.

// --- Facts ------------------------------------------------------------------

const first = (v: unknown): string => (Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "").trim();

export type FactsView = { facts: ConfirmedFacts; profileConfirmed: boolean; unconfirmed: string[] };

/** The Business Brain's confirmed facts — inferred ones are listed, not used. */
export async function confirmedFactsFor(organizationId: string): Promise<FactsView> {
  const s = await loadBrainState(organizationId);
  const p = s.profile as unknown as Record<string, unknown>;
  const unconfirmed: string[] = [];
  const pick = (key: string, label: string): string => {
    const v = first(p[key]);
    if (!v) return "";
    if (s.meta(key).status !== "confirmed") {
      unconfirmed.push(label);
      return "";
    }
    return v;
  };
  const offering = pick("focusItem", "What you want to sell more of") || pick("overview", "What you do");
  // The name the owner gave at sign-up, unless they confirmed another in the Brain.
  const [org, tracking] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, website: true } }),
    db.trackingProfile.findUnique({ where: { organizationId }, select: { nicheId: true } }),
  ]);
  const orgName = org?.name ?? "";
  const businessName = (s.meta("businessName").status === "confirmed" ? first(p.businessName) : "") || orgName;
  const presence = (["local", "online", "both"].includes(String(p.presence)) ? p.presence : "") as ConfirmedFacts["presence"];
  const family = s.family;
  const goal: ConfirmedFacts["goal"] = family === "sales" ? "sales" : family === "bookings" ? "bookings" : family ? "leads" : presence === "online" ? "sales" : "leads";
  const facts: ConfirmedFacts = {
    businessName,
    offering,
    customer: pick("targetCustomer", "Ideal customer"),
    location: pick("serviceArea", "Service area") || pick("location", "Location"),
    presence,
    problem: pick("painPoints", "Problems customers have"),
    outcome: pick("desires", "What customers want") || pick("customerResults", "Results customers get"),
    offer: pick("offers", "Standing offers"),
    proof: pick("usps", "What makes you different"),
    objection: pick("objections", "Why customers hesitate"),
    goal,
    avoid: (Array.isArray(p.avoidClaims) ? p.avoidClaims : []).map(String),
    niche: tracking?.nicheId ?? "general",
    website: org?.website ?? "",
  };
  return { facts, profileConfirmed: Boolean(offering), unconfirmed: [...new Set(unconfirmed)] };
}

export type Gate = { ready: boolean; metaConnected: boolean; profileConfirmed: boolean; next: { label: string; href: string } | null };

/**
 * Suggested ads open once the business profile is confirmed — before any
 * account setup, so the owner sees what their ads could be before connecting
 * anything or paying. Meta is needed later: for Meta's own previews and to
 * run a campaign, and those say so where they're offered.
 */
export async function suggestedAdsGate(organizationId: string): Promise<Gate> {
  const [meta, facts] = await Promise.all([loadMetaConnection(organizationId).catch(() => null), confirmedFactsFor(organizationId)]);
  const metaConnected = meta?.status === "CONNECTED";
  const profileConfirmed = facts.profileConfirmed;
  const next = !profileConfirmed ? { label: "Confirm what you sell in your Business Brain", href: "/dashboard/settings/business-brain" } : null;
  return { ready: profileConfirmed, metaConnected, profileConfirmed, next };
}

// --- Directions ---------------------------------------------------------------

/**
 * Creates the three suggested directions the first time, from confirmed
 * facts. Safe to call on every page view and from two tabs at once: a
 * transaction-scoped lock per business means only one set is ever made.
 */
export async function ensureDirections(organizationId: string, userId: string | null): Promise<{ created: number }> {
  const [{ facts }, rejected] = await Promise.all([
    confirmedFactsFor(organizationId),
    db.adAngle.findMany({ where: { organizationId, status: "REJECTED", angleKind: { not: null } }, select: { angleKind: true } }),
  ]);
  // Kinds the owner turned down aren't suggested again.
  const { directions } = buildDirections(facts, { exclude: rejected.map((r) => r.angleKind!) });
  if (!directions.length) return { created: 0 };
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`suggested-ads:${organizationId}`}))`;
    const existing = await tx.adAngle.count({ where: { organizationId, angleKind: { not: null }, status: { notIn: ["ARCHIVED", "REJECTED"] } } });
    if (existing > 0) return { created: 0 };
    for (const [i, d] of directions.entries()) {
      await tx.adAngle.create({
        data: {
          organizationId,
          title: d.title,
          angleKind: d.kind,
          rank: i + 1,
          recommended: d.recommended,
          recommendedWhy: d.recommendedWhy,
          format: d.format,
          createdById: userId,
          revisions: { create: { organizationId, version: 1, hook: d.hook, body: d.body, cta: d.cta, why: d.why, source: "template", createdById: userId } },
        },
      });
    }
    return { created: directions.length };
  });
}

/** Sets aside the directions nobody approved and suggests a fresh three from today's facts. */
export async function refreshDirections(organizationId: string, userId: string | null): Promise<{ created: number }> {
  const approvedIds = (await db.creativeApproval.findMany({ where: { organizationId, revokedAt: null }, select: { angleId: true } })).map((a) => a.angleId);
  await db.adAngle.updateMany({ where: { organizationId, angleKind: { not: null }, status: "DRAFT", id: { notIn: approvedIds } }, data: { status: "ARCHIVED" } });
  const live = await db.adAngle.count({ where: { organizationId, angleKind: { not: null }, status: { notIn: ["ARCHIVED", "REJECTED"] } } });
  if (live > 0) return { created: 0 };
  return ensureDirections(organizationId, userId);
}

const revisionIdsIn = (variantsJson: string): string[] => {
  try {
    return (JSON.parse(variantsJson) as { angleRevisionId?: unknown }[]).map((v) => String(v.angleRevisionId ?? ""));
  } catch {
    return [];
  }
};

/**
 * The owner turns a direction down, with their reason. Its approval is
 * withdrawn, a proposed test that used it is stopped, and — when there's a
 * kind of ad it hasn't shown yet — MAIRO suggests one in its place. A
 * direction in a test that's approved or running can't be turned down until
 * the test is stopped: the test's ads were approved as they are.
 */
export async function rejectDirection(organizationId: string, userId: string, angleId: string, reason: string): Promise<{ ok: true; replacement: string | null } | { ok: false; error: string }> {
  const angle = await db.adAngle.findFirst({ where: { id: angleId, organizationId, angleKind: { not: null }, status: { notIn: ["ARCHIVED", "REJECTED"] } }, include: { revisions: { select: { id: true } } } });
  if (!angle) return { ok: false, error: "That direction isn't in your account." };
  const mine = new Set(angle.revisions.map((r) => r.id));
  const tests = await db.creativeExperiment.findMany({ where: { organizationId, status: { in: ["PROPOSED", "APPROVED", "RUNNING"] } }, select: { id: true, status: true, variantsJson: true } });
  const inTest = tests.filter((t) => revisionIdsIn(t.variantsJson).some((id) => mine.has(id)));
  if (inTest.some((t) => t.status !== "PROPOSED")) return { ok: false, error: "This direction is in your test. Stop the test first, then turn it down." };
  const why = reason.replace(/\s+/g, " ").trim().slice(0, 300) || null;
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.adAngle.update({ where: { id: angle.id }, data: { status: "REJECTED", rejectedReason: why, rejectedAt: now, recommended: false } });
    await tx.creativeApproval.updateMany({ where: { organizationId, angleId: angle.id, revokedAt: null }, data: { revokedAt: now } });
    if (inTest.length) {
      await tx.creativeExperiment.updateMany({ where: { organizationId, id: { in: inTest.map((t) => t.id) }, status: "PROPOSED" }, data: { status: "CANCELED", endsAt: now, conclusion: "Set aside before it ran: you turned down one of its directions." } });
    }
  });
  const replacement = await suggestReplacement(organizationId, userId, angle.recommended);
  await proposeTest(organizationId);
  return { ok: true, replacement };
}

/** One new direction of a kind not yet shown or turned down; the recommendation moves on if it was the one turned down. */
async function suggestReplacement(organizationId: string, userId: string, wasRecommended: boolean): Promise<string | null> {
  const { facts } = await confirmedFactsFor(organizationId);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`suggested-ads:${organizationId}`}))`;
    const shown = await tx.adAngle.findMany({ where: { organizationId, angleKind: { not: null }, status: { not: "ARCHIVED" } }, orderBy: { rank: "asc" }, select: { id: true, angleKind: true, status: true, rank: true } });
    const live = shown.filter((a) => a.status !== "REJECTED");
    const next = buildDirections(facts, { exclude: shown.map((a) => a.angleKind!) }).directions[0] ?? null;
    if (next) {
      await tx.adAngle.create({
        data: {
          organizationId,
          title: next.title,
          angleKind: next.kind,
          rank: Math.max(0, ...shown.map((a) => a.rank)) + 1,
          recommended: false,
          format: next.format,
          createdById: userId,
          revisions: { create: { organizationId, version: 1, hook: next.hook, body: next.body, cta: next.cta, why: next.why, source: "template", createdById: userId } },
        },
      });
    }
    if (wasRecommended) {
      const first = live[0] ?? null;
      if (first) await tx.adAngle.update({ where: { id: first.id }, data: { recommended: true, recommendedWhy: recommendedWhyFor(first.angleKind!) } });
    }
    return next?.title ?? null;
  });
}

/** Puts a turned-down direction back among the suggestions, to approve or change as before. */
export async function bringBackDirection(organizationId: string, angleId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await db.adAngle.updateMany({ where: { id: angleId, organizationId, status: "REJECTED" }, data: { status: "DRAFT", rejectedReason: null, rejectedAt: null } });
  return r.count ? { ok: true } : { ok: false, error: "That direction isn't one you turned down." };
}

export type WordsCheck = { problems: string[]; warnings: string[] };

/** The same copy check the campaign builder uses, plus the business's brand rules. */
export function checkWords(w: { hook: string; body: string; cta: string }, avoid: string[], brand: BrandRules | null = null): WordsCheck {
  const problems: string[] = [];
  if (w.hook.trim().length < 4) problems.push("Write an opening line.");
  if (w.hook.length > 160) problems.push("Keep the opening line under 160 characters.");
  if (w.body.length > 600) problems.push("Keep the rest of the text under 600 characters.");
  if (!w.cta.trim()) problems.push("Choose what the button says.");
  const avoided = usesAvoided(`${w.hook} ${w.body}`, avoid);
  if (avoided) problems.push(`“${avoided}” is on your list of words to avoid.`);
  const warnings = checkCopy({ primaryText: `${w.hook} ${w.body}`.trim(), headline: w.hook.slice(0, 40), cta: "LEARN_MORE" }, "WEBSITE").map((f) => f.text);
  if (brand) for (const f of brandCheck(`${w.hook} ${w.body}`, brand)) (f.level === "problem" ? problems : warnings).push(f.text);
  return { problems: [...new Set(problems)], warnings };
}

/** A new version of a direction's words. The previous versions stay. */
export type RevisionSource = "owner" | "ai" | "fix";

export async function reviseDirection(organizationId: string, userId: string, angleId: string, w: { hook: string; body: string; cta: string }, source: RevisionSource = "owner"): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const angle = await db.adAngle.findFirst({ where: { id: angleId, organizationId }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!angle) return { ok: false, error: "That direction isn't in your account." };
  const [{ facts }, brand] = await Promise.all([confirmedFactsFor(organizationId), brandRulesFor(organizationId).catch(() => null)]);
  const words = { hook: w.hook.replace(/\s+/g, " ").trim(), body: w.body.replace(/\s+/g, " ").trim(), cta: w.cta.trim().slice(0, 30) };
  const check = checkWords(words, facts.avoid, brand);
  if (check.problems.length) return { ok: false, error: check.problems[0] };
  const latest = angle.revisions[0];
  if (latest && latest.hook === words.hook && latest.body === words.body && latest.cta === words.cta) return { ok: true, version: latest.version };
  const version = (latest?.version ?? 0) + 1;
  await db.adAngleRevision.create({
    data: { angleId, organizationId, version, hook: words.hook, body: words.body, cta: words.cta, why: latest?.why ?? "", source, brandIssuesJson: check.warnings.length ? JSON.stringify(check.warnings) : null, createdById: userId },
  });
  await db.adAngle.update({ where: { id: angleId }, data: { updatedAt: new Date() } });
  return { ok: true, version };
}

// --- Videos -----------------------------------------------------------------

export async function saveOwnerVideo(organizationId: string, userId: string, v: { angleId: string; url: string; posterUrl: string | null; name: string; durationMs: number; width: number; height: number; bytes: number }) {
  const angle = await db.adAngle.findFirst({ where: { id: v.angleId, organizationId }, select: { id: true } });
  if (!angle) return { ok: false as const, error: "That direction isn't in your account." };
  const video = await db.ownerVideo.create({
    data: {
      organizationId,
      angleId: v.angleId,
      url: v.url,
      posterUrl: v.posterUrl,
      fileName: v.name.slice(0, 120),
      durationMs: Math.round(v.durationMs),
      width: v.width,
      height: v.height,
      bytes: v.bytes,
      createdById: userId,
      revisions: { create: { organizationId, version: 1, editsJson: JSON.stringify(NO_EDITS), note: "The original, as uploaded", createdById: userId } },
    },
  });
  return { ok: true as const, videoId: video.id };
}

/** Saves an edit list as a new revision — unless it's the same as the latest. */
export async function saveVideoEdits(organizationId: string, userId: string, videoId: string, raw: unknown): Promise<{ ok: true; version: number; changed: boolean } | { ok: false; error: string }> {
  const video = await db.ownerVideo.findFirst({ where: { id: videoId, organizationId }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!video) return { ok: false, error: "That video isn't in your account." };
  const meta: VideoMeta = { durationMs: video.durationMs, width: video.width, height: video.height };
  const edits = parseEdits(raw, meta);
  // A logo must be a file in this business's own uploads (or, in local development, a sample file).
  if (edits.logo && !isOwnUpload(edits.logo.url, organizationId) && !(localMedia() && /^\/[\w./-]+$/.test(edits.logo.url) && !edits.logo.url.includes(".."))) {
    return { ok: false, error: "That logo isn't in your business's uploads. Upload it again." };
  }
  const latest = video.revisions[0];
  if (latest && sameEdits(parseEdits(latest.editsJson, meta), edits)) return { ok: true, version: latest.version, changed: false };
  const version = (latest?.version ?? 0) + 1;
  await db.ownerVideoRevision.create({ data: { videoId, organizationId, version, editsJson: JSON.stringify(edits), note: describeEdits(edits, meta).join(" · "), createdById: userId } });
  return { ok: true, version, changed: true };
}

// --- Approval ---------------------------------------------------------------

export type ApprovedMedia = { kind: "image"; versionId: string; url: string } | { kind: "video"; revisionId: string; url: string; edits: VideoEdits } | { kind: "none" };

/** The fingerprint of exactly what was approved. Any change to the words or the media changes it. */
export function approvalHash(words: { hook: string; body: string; cta: string }, media: ApprovedMedia): string {
  return createHash("sha256").update(JSON.stringify({ words: [words.hook, words.body, words.cta], media })).digest("hex");
}

export type SuggestionView = Awaited<ReturnType<typeof listSuggestions>>["directions"][number];

/** Everything the page shows, for one business. */
export async function listSuggestions(organizationId: string) {
  const [factsView, angles, approvals, brand, rejected, tracking] = await Promise.all([
    confirmedFactsFor(organizationId),
    db.adAngle.findMany({ where: { organizationId, angleKind: { not: null }, status: { notIn: ["ARCHIVED", "REJECTED"] } }, orderBy: [{ rank: "asc" }, { createdAt: "asc" }], include: { revisions: { orderBy: { version: "desc" } } } }),
    db.creativeApproval.findMany({ where: { organizationId, revokedAt: null }, orderBy: { approvedAt: "desc" } }),
    brandRulesFor(organizationId).catch(() => null),
    db.adAngle.findMany({ where: { organizationId, angleKind: { not: null }, status: "REJECTED" }, orderBy: { rejectedAt: "desc" }, take: 10, select: { id: true, title: true, rejectedReason: true, rejectedAt: true } }),
    trackingOverview(organizationId).catch(() => null),
  ]);
  const ids = angles.map((a) => a.id);
  const [assets, videos] = await Promise.all([
    db.creativeStudioAsset.findMany({ where: { organizationId, angleId: { in: ids }, archivedAt: null }, orderBy: { createdAt: "desc" }, include: { versions: { orderBy: { version: "desc" } } } }),
    db.ownerVideo.findMany({ where: { organizationId, angleId: { in: ids }, archivedAt: null }, orderBy: { createdAt: "desc" }, include: { revisions: { orderBy: { version: "desc" } } } }),
  ]);
  const directions = angles.map((a) => {
    const latest = a.revisions[0];
    const images = assets
      .filter((x) => x.angleId === a.id)
      .map((x) => {
        const done = x.versions.find((v) => v.status === "COMPLETE" && v.imageUrl);
        const pending = x.versions.find((v) => v.status === "PENDING");
        const failed = x.versions.find((v) => v.status === "FAILED");
        const newer = (v: { version: number } | undefined) => Boolean(v && done && v.version > done.version);
        return {
          assetId: x.id,
          versionId: done?.id ?? null,
          version: done?.version ?? null,
          url: done?.imageUrl ?? null,
          state: done ? "ready" : pending ? "making" : failed ? "failed" : "making",
          error: failed?.errorMessage ?? null,
          /** A change to a finished picture: still being made, or the last one failed (no credits used). */
          changing: newer(pending),
          changeError: newer(failed) ? failed!.errorMessage : null,
          /** Every finished version, newest first — to compare and to go back to. */
          history: x.versions.filter((v) => v.status === "COMPLETE" && v.imageUrl).map((v) => ({ versionId: v.id, version: v.version, url: v.imageUrl!, instruction: v.instruction, createdAt: v.createdAt })),
        };
      });
    const vids = videos
      .filter((v) => v.angleId === a.id)
      .map((v) => {
        const meta: VideoMeta = { durationMs: v.durationMs, width: v.width, height: v.height };
        const rev = v.revisions[0];
        const render = rev ? { status: rev.renderStatus as "RENDERING" | "READY" | "FAILED" | null, url: rev.renderedUrl, posterUrl: rev.renderedPosterUrl, error: rev.renderError, durationMs: rev.renderedDurationMs, width: rev.renderedWidth, height: rev.renderedHeight } : null;
        return { videoId: v.id, url: v.url, posterUrl: v.posterUrl, name: v.fileName, bytes: v.bytes, meta, revisionId: rev?.id ?? null, version: rev?.version ?? 1, edits: rev ? parseEdits(rev.editsJson, meta) : { ...NO_EDITS }, render, history: v.revisions.map((r) => ({ version: r.version, note: r.note, createdAt: r.createdAt })) };
      });
    const approval = approvals.find((p) => p.angleId === a.id) ?? null;
    let approvalState: "none" | "current" | "changed" = "none";
    if (approval && latest) {
      const media: ApprovedMedia = approval.studioVersionId
        ? (() => {
            const img = images.find((i) => i.versionId === approval.studioVersionId);
            return img?.url ? ({ kind: "image", versionId: img.versionId!, url: img.url } as const) : ({ kind: "none" } as const);
          })()
        : approval.videoRevisionId
          ? (() => {
              const vid = vids.find((v) => v.revisionId === approval.videoRevisionId);
              return vid ? ({ kind: "video", revisionId: vid.revisionId!, url: vid.render?.status === "READY" && vid.render.url ? vid.render.url : vid.url, edits: vid.edits } as const) : ({ kind: "none" } as const);
            })()
          : ({ kind: "none" } as const);
      const sameWords = approval.angleRevisionId === latest.id;
      approvalState = sameWords && approvalHash(latest, media) === approval.contentHash ? "current" : "changed";
    }
    return {
      id: a.id,
      title: a.title,
      kind: a.angleKind,
      audience: audienceFor(factsView.facts),
      destination: destinationFor(factsView.facts),
      testReason: TEST_REASON[a.angleKind as HookAngle] ?? null,
      rank: a.rank,
      recommended: a.recommended,
      recommendedWhy: a.recommendedWhy,
      format: a.format,
      status: a.status,
      words: latest ? { revisionId: latest.id, version: latest.version, hook: latest.hook, body: latest.body, cta: latest.cta, why: latest.why, source: latest.source } : null,
      history: a.revisions.map((r) => ({ version: r.version, hook: r.hook, source: r.source, createdAt: r.createdAt })),
      images,
      videos: vids,
      approval: approval ? { id: approval.id, at: approval.approvedAt, state: approvalState, studioVersionId: approval.studioVersionId, videoRevisionId: approval.videoRevisionId } : null,
    };
  });
  const { facts } = factsView;
  return {
    facts,
    brand,
    unconfirmed: factsView.unconfirmed,
    intro: introFor(facts, directions.length),
    directions,
    missing: buildDirections(facts).missing,
    rejected: rejected.map((r) => ({ id: r.id, title: r.title, reason: r.rejectedReason, at: r.rejectedAt })),
    tracking: trackingReadiness(tracking),
  };
}

/**
 * What the readiness check needs from tracking: can Meta see the result this
 * goal counts? Only a verified check says yes; a pixel not chosen or not
 * installed, or an event checked and not seen, says no; anything in between
 * is unknown, and the check says so rather than guess.
 */
export function trackingReadiness(t: { stage: { stage: string }; requiredEvent: string | null } | null): { pixelSeesResult: boolean | null; leadFormReady: boolean; stage: string | null } {
  if (!t) return { pixelSeesResult: null, leadFormReady: false, stage: null };
  const s = t.stage.stage;
  const pixelSeesResult = s === "verified" ? true : ["no_asset", "asset_selected", "installation_pending", "event_verification_pending"].includes(s) ? false : null;
  // No event needed: the first campaign collects leads in a form inside the ad.
  return { pixelSeesResult, leadFormReady: t.requiredEvent === null, stage: s };
}

/**
 * The owner approves this direction's current words with one picture version
 * or one video revision — the latest ones, checked here, never whatever the
 * browser says is latest. An earlier approval of the same direction is
 * withdrawn in the same transaction.
 */
export async function approveCreative(
  organizationId: string,
  userId: string,
  input: { angleId: string; revisionId: string; studioVersionId?: string | null; videoRevisionId?: string | null },
): Promise<{ ok: true; approvalId: string } | { ok: false; error: string }> {
  const angle = await db.adAngle.findFirst({ where: { id: input.angleId, organizationId }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!angle) return { ok: false, error: "That direction isn't in your account." };
  const latest = angle.revisions[0];
  if (!latest || latest.id !== input.revisionId) return { ok: false, error: "The words changed since this page loaded. Review the latest version and approve again." };

  let media: ApprovedMedia = { kind: "none" };
  if (input.studioVersionId) {
    const v = await db.creativeStudioVersion.findFirst({ where: { id: input.studioVersionId, status: "COMPLETE", asset: { organizationId, angleId: angle.id } }, include: { asset: { include: { versions: { where: { status: "COMPLETE" }, orderBy: { version: "desc" }, take: 1 } } } } });
    if (!v?.imageUrl) return { ok: false, error: "That picture isn't ready or isn't in your account." };
    if (v.asset.versions[0]?.id !== v.id) return { ok: false, error: "There's a newer version of that picture. Review it and approve again." };
    media = { kind: "image", versionId: v.id, url: v.imageUrl };
  } else if (input.videoRevisionId) {
    const r = await db.ownerVideoRevision.findFirst({ where: { id: input.videoRevisionId, organizationId, video: { angleId: angle.id } }, include: { video: { include: { revisions: { orderBy: { version: "desc" }, take: 1 } } } } });
    if (!r) return { ok: false, error: "That video isn't in your account." };
    if (r.video.revisions[0]?.id !== r.id) return { ok: false, error: "The video's edits changed since this page loaded. Review them and approve again." };
    // The file the ad will play: the rendered edit when there is one, otherwise the original.
    media = { kind: "video", revisionId: r.id, url: r.renderStatus === "READY" && r.renderedUrl ? r.renderedUrl : r.video.url, edits: parseEdits(r.editsJson, { durationMs: r.video.durationMs, width: r.video.width, height: r.video.height }) };
  } else {
    return { ok: false, error: "Choose the picture or video that goes with these words." };
  }

  const contentHash = approvalHash(latest, media);
  const approval = await db.$transaction(async (tx) => {
    await tx.creativeApproval.updateMany({ where: { organizationId, angleId: angle.id, revokedAt: null }, data: { revokedAt: new Date() } });
    const created = await tx.creativeApproval.create({
      data: { organizationId, angleId: angle.id, angleRevisionId: latest.id, studioVersionId: media.kind === "image" ? media.versionId : null, videoRevisionId: media.kind === "video" ? media.revisionId : null, contentHash, approvedById: userId },
    });
    await tx.adAngle.update({ where: { id: angle.id }, data: { status: "APPROVED" } });
    return created;
  });
  await proposeTest(organizationId);
  return { ok: true, approvalId: approval.id };
}

/**
 * Learning from results starts with a fair test: once two directions are
 * approved, a proposed test records exactly which versions would be compared
 * and what it's trying to learn. It runs only when the owner approves it with
 * a campaign; a winner is named only when the evidence supports one.
 */
async function proposeTest(organizationId: string) {
  // One test at a time: while one is approved or running, its versions stay as they were approved.
  const open = await db.creativeExperiment.count({ where: { organizationId, status: { in: ["APPROVED", "RUNNING"] } } });
  if (open > 0) return;
  const approved = await db.creativeApproval.findMany({ where: { organizationId, revokedAt: null }, orderBy: { approvedAt: "asc" } });
  if (approved.length < 2) return;
  const angles = await db.adAngle.findMany({ where: { organizationId, id: { in: approved.map((a) => a.angleId) } }, select: { id: true, title: true } });
  const title = (id: string) => angles.find((a) => a.id === id)?.title ?? "A direction";
  // Two versions: a fair comparison that small budgets can still decide. The recommended direction goes first — its picture is the one both versions use.
  const recommended = await db.adAngle.findFirst({ where: { organizationId, recommended: true, id: { in: approved.map((a) => a.angleId) } }, select: { id: true } }).catch(() => null);
  const ordered = recommended ? [...approved.filter((a) => a.angleId === recommended.id), ...approved.filter((a) => a.angleId !== recommended.id)] : approved;
  const variants = ordered.slice(0, 2).map((a) => ({ label: title(a.angleId), angleRevisionId: a.angleRevisionId, studioVersionId: a.studioVersionId ?? undefined }));
  const hypothesis = `Which opening brings more of the results you want: ${variants.map((v) => v.label.toLowerCase()).join(" or ")}?`;
  const existing = await db.creativeExperiment.findFirst({ where: { organizationId, status: "PROPOSED", mairoCampaignId: null, variable: "hook" } });
  if (existing) await db.creativeExperiment.update({ where: { id: existing.id }, data: { hypothesis, variantsJson: JSON.stringify(variants) } });
  else await db.creativeExperiment.create({ data: { organizationId, hypothesis, variable: "hook", variantsJson: JSON.stringify(variants), status: "PROPOSED" } });
}

// --- Continue to a campaign -----------------------------------------------------

/**
 * "Approve creative and continue": a campaign draft carrying exactly the
 * approved words and picture or video, opened in the campaign builder. The
 * draft is made once per approval. Nothing is built in the ad account and
 * nothing spends until the owner presses Launch at the end of the builder.
 */
export async function draftFromApproval(organizationId: string, userId: string, angleId: string): Promise<{ ok: true; draftId: string } | { ok: false; error: string }> {
  // Checked first: an ad changed since it was approved can't continue, even to a draft made earlier.
  const built = await planFromApproval(organizationId, angleId);
  if (!built.ok) return built;
  const existing = await db.campaignDraft.findFirst({ where: { organizationId, data: { path: ["suggestedApprovalId"], equals: built.approvalId } }, select: { id: true } });
  if (existing) return { ok: true, draftId: existing.id };
  const draft = await db.campaignDraft.create({
    data: { organizationId, createdByUserId: userId, service: "meta", step: "business", label: `Suggested ad — ${built.title}`.slice(0, 120), data: JSON.parse(JSON.stringify(built.plan)) },
    select: { id: true },
  });
  return { ok: true, draftId: draft.id };
}

/**
 * The campaign plan for one approved direction — its exact words and picture
 * or video — without saving it. Shared by "continue to a campaign" and by a
 * creative test, which adds a second direction's words to the same picture.
 */
export async function planFromApproval(
  organizationId: string,
  angleId: string,
): Promise<{ ok: true; plan: CampaignPlan & { suggestedApprovalId: string }; title: string; approvalId: string } | { ok: false; error: string }> {
  const approval = await db.creativeApproval.findFirst({ where: { organizationId, angleId, revokedAt: null }, orderBy: { approvedAt: "desc" } });
  if (!approval) return { ok: false, error: "Approve this ad first." };
  const view = (await listSuggestions(organizationId)).directions.find((d) => d.id === angleId);
  if (!view?.words || view.approval?.state !== "current") return { ok: false, error: "This ad changed since you approved it. Review it and approve again." };

  const [org, { facts }] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, website: true, defaultMessageChannel: true } }),
    confirmedFactsFor(organizationId),
  ]);
  if (!org) return { ok: false, error: "Business not found." };

  let visual: Partial<CampaignPlan>;
  if (approval.studioVersionId) {
    const asset = await db.creativeStudioAsset.findFirst({ where: { organizationId, angleId, versions: { some: { id: approval.studioVersionId } } }, select: { id: true } });
    const image = view.images.find((i) => i.versionId === approval.studioVersionId);
    if (!asset || !image?.url) return { ok: false, error: "That picture isn't in your account any more." };
    // The same reviewed bridge the campaign builder uses for a Studio picture.
    const attached = await attachAssetToCampaign(organizationId, asset.id);
    if (!attached.ok) return { ok: false, error: attached.error };
    visual = { adChoice: "attached", attachedPreview: image.url, studioAssetId: asset.id };
  } else {
    const video = view.videos.find((v) => v.revisionId === approval.videoRevisionId);
    if (!video?.posterUrl) return { ok: false, error: "That video isn't in your account any more." };
    // The rendered edit when it's ready; the original otherwise, as the owner acknowledged when approving.
    const r = video.render?.status === "READY" && video.render.url ? video.render : null;
    visual = r
      ? { adChoice: "video", video: { url: r.url!, posterUrl: r.posterUrl ?? video.posterUrl, name: `${video.name ?? "Your video"} (edited, v${video.version})`, width: r.width ?? video.meta.width, height: r.height ?? video.meta.height, durationSec: Math.round((r.durationMs ?? video.meta.durationMs) / 100) / 10, bytes: video.bytes } }
      : { adChoice: "video", video: { url: video.url, posterUrl: video.posterUrl, name: video.name ?? "Your video", width: video.meta.width, height: video.meta.height, durationSec: Math.round(video.meta.durationMs / 100) / 10, bytes: video.bytes } };
  }

  const w = view.words;
  const base = newPlan({ service: "meta", businessName: org.name, website: org.website, offering: facts.offering || null, targetAudience: facts.customer || null, differentiator: facts.proof || null, messageChannel: org.defaultMessageChannel, timeZone: "", metaPercent: 100 });
  const headline = w.hook.length <= 40 ? w.hook : facts.offering.replace(/[.!]+$/, "").slice(0, 40);
  const plan: CampaignPlan & { suggestedApprovalId: string } = {
    ...base,
    ...visual,
    goal: facts.goal === "sales" ? "SALES" : "LEADS",
    copyOptions: [{ primaryText: [w.hook, w.body].filter(Boolean).join("\n\n"), headline, cta: ctaTypeFor(w.cta), angle: view.title }],
    chosenCopy: 0,
    suggestedApprovalId: approval.id,
  };
  return { ok: true, plan, title: view.title, approvalId: approval.id };
}

/** The test MAIRO proposed once two directions were approved, if any — for "How MAIRO learns which works". */
export async function proposedTest(organizationId: string) {
  const row = await db.creativeExperiment.findFirst({ where: { organizationId, variable: "hook", status: { in: ["PROPOSED", "APPROVED", "RUNNING", "CONCLUDED"] } }, orderBy: { updatedAt: "desc" } });
  if (!row) return null;
  let variants: { label: string }[] = [];
  try {
    variants = (JSON.parse(row.variantsJson) as { label?: unknown }[]).map((v) => ({ label: String(v.label ?? "A direction") }));
  } catch {
    variants = [];
  }
  return { id: row.id, status: row.status, hypothesis: row.hypothesis, variants, conclusion: row.conclusion };
}
