import { createHash } from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { tiktokRequest } from "./client";
import { tiktokDisplayName } from "./delivery";

// Getting a video ad's pieces into a TikTok advertiser's asset library: the
// video, a cover image, and the identity (name and profile picture) the ad
// appears under.
//
// TikTok fetches the video and cover itself from their public addresses
// (UPLOAD_BY_URL), so the bytes never pass through a serverless function. The
// identity's picture is the one thing made here: the business's initial on the
// MAIRO gradient, since there's no logo on file to use.

type Advertiser = { accessToken: string; advertiserId: string };

/** Uploads a video by its public address. */
export async function uploadVideoByUrl(a: Advertiser, url: string, name: string): Promise<string> {
  const data = await tiktokRequest<unknown>("/file/video/ad/upload/", {
    method: "POST",
    accessToken: a.accessToken,
    form: {
      advertiser_id: a.advertiserId,
      upload_type: "UPLOAD_BY_URL",
      video_url: url,
      file_name: fileName(name, "mp4"),
    },
  });
  // Answered as a list of one, in the versions seen; an object is tolerated.
  const first = (Array.isArray(data) ? data[0] : data) as { video_id?: string } | undefined;
  if (!first?.video_id) throw new Error("TikTok accepted the video but returned no video id.");
  return first.video_id;
}

/**
 * Waits for TikTok to finish processing a video, up to `maxMs`. Returns
 * whether it's usable in an ad yet.
 */
export async function waitForTikTokVideo(a: Advertiser, videoId: string, maxMs = 30_000): Promise<boolean> {
  const started = Date.now();
  let delay = 2_000;
  for (;;) {
    const data = await tiktokRequest<{ list?: { video_id?: string; displayable?: boolean }[] }>("/file/video/ad/info/", {
      accessToken: a.accessToken,
      params: { advertiser_id: a.advertiserId, video_ids: JSON.stringify([videoId]) },
    });
    const info = data.list?.find((v) => v.video_id === videoId);
    // Absent `displayable` is taken as ready: older responses don't carry it.
    if (info && info.displayable !== false) return true;
    if (Date.now() - started + delay > maxMs) return false;
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 6_000);
  }
}

/** Uploads an image (a video's cover) by its public address. */
export async function uploadImageByUrl(a: Advertiser, url: string, name: string): Promise<string> {
  const data = await tiktokRequest<{ image_id?: string }>("/file/image/ad/upload/", {
    method: "POST",
    accessToken: a.accessToken,
    form: {
      advertiser_id: a.advertiserId,
      upload_type: "UPLOAD_BY_URL",
      image_url: url,
      file_name: fileName(name, "jpg"),
    },
  });
  if (!data.image_id) throw new Error("TikTok accepted the image but returned no image id.");
  return data.image_id;
}

async function uploadImageBytes(a: Advertiser, bytes: Buffer, name: string): Promise<string> {
  const data = await tiktokRequest<{ image_id?: string }>("/file/image/ad/upload/", {
    method: "POST",
    accessToken: a.accessToken,
    form: {
      advertiser_id: a.advertiserId,
      upload_type: "UPLOAD_BY_FILE",
      image_signature: createHash("md5").update(bytes).digest("hex"),
      file_name: fileName(name, "png"),
      image_file: new Blob([new Uint8Array(bytes)], { type: "image/png" }),
    },
  });
  if (!data.image_id) throw new Error("TikTok accepted the profile picture but returned no image id.");
  return data.image_id;
}

/** A square profile picture: the business's initial on MAIRO's gradient. */
export async function makeAvatar(businessName: string): Promise<Buffer> {
  const letter = (businessName.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "M").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d7dff"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="260" font-weight="700" fill="#ffffff">${escapeXml(letter)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * The identity ads appear under: the business's name and picture. Made once
 * per advertiser, then remembered on the connection. An existing identity with
 * the same name is reused rather than duplicated.
 */
export async function ensureIdentity(organizationId: string, a: Advertiser, businessName: string): Promise<string> {
  const connection = await db.platformConnection.findUnique({
    where: { organizationId_platform: { organizationId, platform: "TIKTOK" } },
    select: { id: true, tiktokIdentityId: true },
  });
  if (connection?.tiktokIdentityId) return connection.tiktokIdentityId;

  const displayName = tiktokDisplayName(businessName);
  const existing = await tiktokRequest<{ identity_list?: { identity_id?: string; display_name?: string }[] }>("/identity/get/", {
    accessToken: a.accessToken,
    params: { advertiser_id: a.advertiserId, identity_type: "CUSTOMIZED_USER", page_size: 100 },
  }).catch(() => ({ identity_list: [] }));
  let identityId = existing.identity_list?.find((i) => i.display_name === displayName)?.identity_id ?? null;

  if (!identityId) {
    const imageId = await uploadImageBytes(a, await makeAvatar(displayName), "mairo-avatar");
    const created = await tiktokRequest<{ identity_id?: string }>("/identity/create/", {
      method: "POST",
      accessToken: a.accessToken,
      body: { advertiser_id: a.advertiserId, display_name: displayName, image_uri: imageId },
    });
    if (!created.identity_id) throw new Error("TikTok didn't return an identity for the ad.");
    identityId = created.identity_id;
  }

  if (connection) {
    await db.platformConnection.update({ where: { id: connection.id }, data: { tiktokIdentityId: identityId } });
  }
  return identityId;
}

/** Finds TikTok's location id for a city, or null to fall back to the country. */
export async function findTikTokCity(a: Advertiser, label: string, objective: string): Promise<string | null> {
  const city = label.split(",")[0]?.trim();
  if (!city) return null;
  try {
    const data = await tiktokRequest<{
      targeting_tag_list?: { name?: string; geo?: { geo_id?: string; geo_type?: string; region_code?: string } }[];
    }>("/tool/targeting/search/", {
      method: "POST",
      accessToken: a.accessToken,
      body: {
        advertiser_id: a.advertiserId,
        search_type: "FUZZY_SEARCH",
        keywords: [city],
        objective_type: objective,
        placements: ["PLACEMENT_TIKTOK"],
        geo_types: ["CITY"],
        region_codes: ["US"],
        ...(objective === "REACH" ? {} : { promotion_type: "WEBSITE" }),
      },
    });
    const match = data.targeting_tag_list?.find(
      (t) => t.geo?.geo_id && (t.geo.region_code ?? "US") === "US" && (t.name ?? "").toLowerCase().startsWith(city.toLowerCase())
    );
    return match?.geo?.geo_id ?? null;
  } catch {
    return null;
  }
}

function fileName(name: string, ext: string): string {
  const base = name.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 60) || "mairo";
  return `${base}-${Date.now()}.${ext}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
}
