import { db } from "@/lib/db";
import { parseAdCopy } from "@/lib/meta/creative-copy";
import { refKind, type MediaRef } from "./social-logic";

// What a Scale business can post: only media it has already made or approved
// in MAIRO — approved ad pictures, finished Creative Studio images, and the
// videos it uploaded for its campaigns. No arbitrary uploads from here.

export type MediaItem = {
  ref: MediaRef;
  kind: "image" | "video";
  /** For MAIRO's own screens; not what Instagram fetches. */
  previewUrl: string | null;
  label: string;
  /** A starting caption, from the ad copy where there is one. */
  suggested: string;
};

export async function mediaLibrary(organizationId: string): Promise<MediaItem[]> {
  const [requests, studio, videos] = await Promise.all([
    db.creativeRequest.findMany({
      where: { organizationId, status: { in: ["APPROVED", "DELIVERED"] }, images: { some: { isFinal: true } } },
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: { brief: true, aiConcept: true, images: { where: { isFinal: true }, orderBy: { version: "desc" }, take: 1, select: { id: true } } },
    }),
    db.creativeStudioAsset.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 24,
      select: { id: true, versions: { where: { status: "COMPLETE", imageUrl: { not: null } }, orderBy: { version: "desc" }, take: 1, select: { id: true, imageUrl: true, instruction: true } } },
    }),
    db.campaignAd.findMany({
      where: { mairoCampaign: { organizationId }, videoUrl: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, videoUrl: true, videoPosterUrl: true, headline: true, primaryText: true },
    }),
  ]);

  const items: MediaItem[] = [];
  for (const r of requests) {
    const image = r.images[0];
    if (!image) continue;
    const copy = parseAdCopy(r.aiConcept);
    items.push({
      ref: `creative:${image.id}`,
      kind: "image",
      previewUrl: `/api/creatives/${image.id}/raw`,
      label: r.brief.slice(0, 80),
      suggested: [copy.primaryText, copy.headline].filter(Boolean).join("\n\n") || r.brief,
    });
  }
  for (const a of studio) {
    const v = a.versions[0];
    if (!v?.imageUrl) continue;
    items.push({ ref: `studio:${v.id}`, kind: "image", previewUrl: v.imageUrl, label: (v.instruction ?? "Creative Studio image").slice(0, 80), suggested: "" });
  }
  const seen = new Set<string>();
  for (const v of videos) {
    if (!v.videoUrl || seen.has(v.videoUrl)) continue;
    seen.add(v.videoUrl);
    items.push({
      ref: `video:${v.id}`,
      kind: "video",
      previewUrl: v.videoPosterUrl,
      label: (v.headline ?? "Campaign video").slice(0, 80),
      suggested: [v.primaryText, v.headline].filter(Boolean).join("\n\n"),
    });
  }
  return items;
}

/** True when every ref belongs to this business and is still available. */
export async function ownsRefs(organizationId: string, refs: MediaRef[]): Promise<boolean> {
  for (const ref of refs) {
    const id = ref.slice(ref.indexOf(":") + 1);
    if (ref.startsWith("creative:")) {
      const n = await db.creativeImage.count({ where: { id, isFinal: true, creativeRequest: { organizationId, status: { in: ["APPROVED", "DELIVERED"] } } } });
      if (!n) return false;
    } else if (ref.startsWith("studio:")) {
      const n = await db.creativeStudioVersion.count({ where: { id, status: "COMPLETE", imageUrl: { not: null }, asset: { organizationId } } });
      if (!n) return false;
    } else if (ref.startsWith("video:")) {
      const n = await db.campaignAd.count({ where: { id, videoUrl: { not: null }, mairoCampaign: { organizationId } } });
      if (!n) return false;
    } else return false;
  }
  return true;
}

/** A picture's bytes, for the JPEG route. */
export async function imageBytes(ref: MediaRef): Promise<Buffer | null> {
  if (refKind(ref) !== "image") return null;
  const id = ref.slice(ref.indexOf(":") + 1);
  if (ref.startsWith("creative:")) {
    const img = await db.creativeImage.findFirst({ where: { id, isFinal: true }, select: { imageData: true } });
    const m = img ? /^data:image\/[a-z0-9.+-]+;base64,([\s\S]*)$/i.exec(img.imageData.trim()) : null;
    return m ? Buffer.from(m[1], "base64") : null;
  }
  const v = await db.creativeStudioVersion.findFirst({ where: { id, status: "COMPLETE" }, select: { imageUrl: true } });
  if (!v?.imageUrl || !/^https:\/\//.test(v.imageUrl)) return null;
  const res = await fetch(v.imageUrl);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** A Reel's video address, handed to Instagram as it is. */
export async function videoUrl(ref: MediaRef): Promise<string | null> {
  if (!ref.startsWith("video:")) return null;
  const ad = await db.campaignAd.findFirst({ where: { id: ref.slice(6) }, select: { videoUrl: true } });
  return ad?.videoUrl && /^https:\/\//.test(ad.videoUrl) ? ad.videoUrl : null;
}

export async function previewFor(organizationId: string, ref: MediaRef): Promise<string | null> {
  const items = await mediaLibrary(organizationId);
  return items.find((i) => i.ref === ref)?.previewUrl ?? null;
}
