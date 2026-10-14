import { db } from "@/lib/db";
import type { HubAd } from "@/lib/creatives/hub";
import type { LibraryItem, LibraryStage } from "@/lib/creatives/library-view";

// The Creative Library: every ad creative the business has, in one list —
// MAIRO's suggested directions, pictures made in Creative Studio, the owner's
// own uploads, and ads that ran — each with where it came from, where it is
// (draft, approved, launched or turned down), how many versions it has, and
// results only when Meta reported them. Nothing here is estimated.
//
// One business at a time: every query is scoped to the organization passed
// in. The launched ads and their figures come from the hub (lib/creatives/hub),
// which already read them from Meta for this page.

export type { LibraryItem } from "@/lib/creatives/library-view";

const day = (d: Date) => d.toISOString().slice(0, 10);
const SUGGESTED = "/dashboard/creatives/suggested";

export async function loadCreativeLibrary(organizationId: string, launched: HubAd[]): Promise<LibraryItem[]> {
  const [angles, approvals, assets, videos] = await Promise.all([
    db.adAngle.findMany({
      where: { organizationId, angleKind: { not: null }, status: { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 60,
      include: { revisions: { orderBy: { version: "desc" }, take: 1 }, _count: { select: { revisions: true } } },
    }),
    db.creativeApproval.findMany({ where: { organizationId, revokedAt: null }, select: { angleId: true, angleRevisionId: true, studioVersionId: true, videoRevisionId: true } }),
    db.creativeStudioAsset.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 60,
      include: { versions: { where: { status: "COMPLETE" }, orderBy: { version: "desc" } } },
    }),
    db.ownerVideo.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { revisions: { orderBy: { version: "desc" }, select: { id: true, version: true } } },
    }),
  ]);
  const titleOf = new Map(angles.map((a) => [a.id, a.title]));
  const approvedVersions = new Set(approvals.map((a) => a.studioVersionId).filter(Boolean) as string[]);
  const approvedVideoRevisions = new Set(approvals.map((a) => a.videoRevisionId).filter(Boolean) as string[]);
  const items: LibraryItem[] = [];

  for (const a of angles) {
    const latest = a.revisions[0];
    if (!latest) continue;
    const approval = approvals.find((p) => p.angleId === a.id);
    // Approved means these exact words: a later edit leaves it a draft until it's approved again.
    const stage: LibraryStage = a.status === "REJECTED" ? "turned-down" : approval && approval.angleRevisionId === latest.id ? "approved" : "draft";
    const picture = assets.find((x) => x.angleId === a.id && x.versions[0]?.imageUrl);
    const video = videos.find((v) => v.angleId === a.id);
    items.push({
      key: `angle:${a.id}`,
      title: a.title,
      text: [latest.hook, latest.body].filter(Boolean).join(" "),
      preview: picture?.versions[0]?.imageUrl ?? video?.posterUrl ?? null,
      kind: picture ? "image" : video ? "video" : "words",
      source: "suggested",
      stage,
      versions: a._count.revisions,
      versionNote: `Words v${latest.version}`,
      context: a.status === "REJECTED" && a.rejectedReason ? `Turned down: ${a.rejectedReason}` : null,
      href: SUGGESTED,
      date: day(a.updatedAt),
      performance: null,
    });
  }

  for (const x of assets) {
    const v = x.versions[0];
    if (!v?.imageUrl) continue;
    const forDirection = x.angleId ? titleOf.get(x.angleId) ?? null : null;
    items.push({
      key: `asset:${x.id}`,
      title: forDirection ? `Picture for “${forDirection}”` : x.versions[x.versions.length - 1]?.instruction?.slice(0, 80) || "Creative Studio picture",
      text: v.instruction,
      preview: v.imageUrl,
      kind: "image",
      source: x.source === "OWN_UPLOAD" ? "uploaded" : "generated",
      stage: approvedVersions.has(v.id) ? "approved" : "draft",
      versions: x.versions.length,
      versionNote: `Picture v${v.version}`,
      context: forDirection ? "Suggested ad" : x.source === "PRODUCT_UPLOAD" ? "From your product photo" : null,
      href: forDirection ? SUGGESTED : "/dashboard/creative-studio",
      date: day(x.updatedAt),
      performance: null,
    });
  }

  for (const v of videos) {
    const forDirection = v.angleId ? titleOf.get(v.angleId) ?? null : null;
    const latest = v.revisions[0];
    items.push({
      key: `video:${v.id}`,
      title: v.fileName || "Your video",
      text: null,
      preview: v.posterUrl,
      kind: "video",
      source: "uploaded",
      stage: latest && approvedVideoRevisions.has(latest.id) ? "approved" : "draft",
      versions: v.revisions.length,
      versionNote: `Edit v${latest?.version ?? 1}`,
      context: forDirection ? `For “${forDirection}”` : null,
      href: SUGGESTED,
      date: day(v.createdAt),
      performance: null,
    });
  }

  for (const ad of launched) {
    items.push({
      key: `ad:${ad.id}`,
      title: ad.name,
      text: ad.primaryText,
      preview: ad.preview,
      kind: ad.kind === "VIDEO" ? "video" : "image",
      source: "launched",
      stage: "launched",
      versions: 1,
      versionNote: ad.status,
      context: ad.campaignName,
      href: `/dashboard/campaigns/${ad.campaignId}?tab=creatives`,
      date: ad.date,
      performance: ad.results !== null ? { resultText: ad.resultText, costPerResultCents: ad.costPerResultCents, spendCents: ad.spendCents } : null,
    });
  }

  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
