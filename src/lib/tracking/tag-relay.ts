import { db } from "@/lib/db";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import { sendMetaConversions } from "@/lib/tracking/meta-pixel";
import { nicheById } from "@/lib/tracking/niches";
import { consentPolicyFrom } from "@/lib/tracking/state";
import { acceptedEvents, tagRules, tagScript, validTagId } from "@/lib/tracking/smart-tag";

// The server half of the MAIRO tag (lib/tracking/smart-tag.ts): building a
// business's tag file, and relaying the outcomes it reports to Meta's
// Conversions API with the business's own Meta connection.
//
// Everything arriving here comes from a stranger's browser on somebody's
// website, so the body is treated as hostile: one of a fixed list of event
// names, an id of a fixed shape, Meta's own cookie formats, and a page address
// on the business's own website (when MAIRO knows it). What a forger could do
// is send fake leads to one business's own pixel — bounded by the checks
// below and a per-tag rate limit — and nothing else: the endpoint returns
// nothing and reads nothing back.

export type TagTarget = { organizationId: string; pixelId: string; nicheId: string; consentRequired: boolean; website: string | null };

export async function tagTarget(tagId: string): Promise<TagTarget | null> {
  if (!validTagId(tagId)) return null;
  const pixel = await db.trackingPixel.findUnique({
    where: { id: tagId },
    select: { platform: true, externalPixelId: true, organizationId: true, organization: { select: { website: true, trackingProfile: { select: { nicheId: true, serverEventsConsent: true } } } } },
  });
  if (!pixel || pixel.platform !== "META" || !/^\d{6,30}$/.test(pixel.externalPixelId)) return null;
  const profile = pixel.organization.trackingProfile;
  return {
    organizationId: pixel.organizationId,
    pixelId: pixel.externalPixelId,
    nicheId: profile?.nicheId ?? "general",
    consentRequired: consentPolicyFrom(profile?.serverEventsConsent) === "require_granted",
    website: pixel.organization.website,
  };
}

/** The business's tag file. */
export function buildTagFile(target: TagTarget, tagId: string, appUrl: string): string {
  return tagScript({
    pixel: target.pixelId,
    endpoint: `${appUrl.replace(/\/+$/, "")}/api/t/${tagId}`,
    rules: tagRules(nicheById(target.nicheId)),
    consentRequired: target.consentRequired,
  });
}

export type TagHit = { e: string; id: string; u: string; fbp: string | null; fbc: string | null; c: 0 | 1 };

const FB_COOKIE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.-]{1,500}$/;

/** A report from the tag, or null if it isn't one. */
export function parseTagHit(raw: string): TagHit | null {
  if (raw.length > 2000) return null;
  let v: Record<string, unknown>;
  try {
    v = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const { e, id, u, fbp, fbc, c } = v;
  if (typeof e !== "string" || !/^[A-Za-z]{2,40}$/.test(e)) return null;
  if (typeof id !== "string" || !/^m[a-z0-9]{8,30}$/.test(id)) return null;
  if (typeof u !== "string" || u.length > 500) return null;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return {
    e,
    id,
    // Origin and path only: the tag never sends a query, and one is never forwarded.
    u: `${url.origin}${url.pathname}`,
    fbp: typeof fbp === "string" && FB_COOKIE.test(fbp) ? fbp : null,
    fbc: typeof fbc === "string" && FB_COOKIE.test(fbc) ? fbc : null,
    c: c === 1 ? 1 : 0,
  };
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/** Whether a page belongs to the business's website: same host, or a subdomain of it. Unknown website: yes. */
export function onBusinessSite(pageUrl: string, website: string | null): boolean {
  if (!website) return true;
  let site: string;
  try {
    site = bareHost(new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname);
  } catch {
    return true;
  }
  const page = bareHost(new URL(pageUrl).hostname);
  return page === site || page.endsWith(`.${site}`);
}

export type Verdict = { send: true } | { send: false; why: "event" | "consent" | "site" };

/** Whether a hit is relayed, and if not, why. Pure. */
export function judgeHit(hit: TagHit, target: TagTarget): Verdict {
  if (!acceptedEvents(nicheById(target.nicheId)).has(hit.e)) return { send: false, why: "event" };
  if (target.consentRequired && hit.c !== 1) return { send: false, why: "consent" };
  if (!onBusinessSite(hit.u, target.website)) return { send: false, why: "site" };
  return { send: true };
}

// A per-tag ceiling, per server instance: generous for a real small business,
// tight enough that a script hammering one tag can't flood its pixel.
const WINDOW_MS = 60_000;
const PER_WINDOW = 60;
const hits = new Map<string, { start: number; n: number }>();

export function underRateLimit(tagId: string, now = Date.now()): boolean {
  const h = hits.get(tagId);
  if (!h || now - h.start > WINDOW_MS) {
    hits.set(tagId, { start: now, n: 1 });
    if (hits.size > 5000) hits.clear();
    return true;
  }
  h.n++;
  return h.n <= PER_WINDOW;
}

/** Sends one outcome to Meta with the business's connection. Never throws. */
export async function relayHit(target: TagTarget, hit: TagHit, visitor: { ip: string | null; userAgent: string | null }): Promise<void> {
  try {
    const creds = await loadCredentials(target.organizationId, "META");
    if (!creds || creds.status !== "CONNECTED") return;
    const result = await sendMetaConversions(target.pixelId, creds.accessToken, [
      {
        eventName: hit.e,
        eventId: hit.id,
        eventTime: new Date(),
        valueCents: null,
        currency: "usd",
        fbp: hit.fbp,
        fbc: hit.fbc,
        clientIp: visitor.ip,
        userAgent: visitor.userAgent,
        sourceUrl: hit.u,
      },
    ]);
    if (result.messages.length) console.warn(`[tag] ${target.organizationId} ${hit.e}: Meta said ${result.messages.join(" | ")}`);
  } catch (error) {
    console.error(`[tag] couldn't relay ${hit.e} for ${target.organizationId}:`, error instanceof Error ? error.message : error);
  }
}
