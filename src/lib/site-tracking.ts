import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { reportError } from "@/lib/monitoring/report";
import { siteUrl } from "@/lib/site";
import { hashEmail } from "@/lib/tracking/hash";
import { sendMetaConversions } from "@/lib/tracking/meta-pixel";
import { loadCredentials } from "@/lib/ad-platforms/connections";

// MAIRO measuring its own ads: the steps a visitor takes on mairo.io after an
// ad, sent to MAIRO's own Meta pixel through the Conversions API.
//
//   Lead                  a free ad plan finished (/api/events)
//   CompleteRegistration  an account created (signUpAction)
//   StartTrial/Subscribe  a Pro trial or a paid plan started (applySubscription)
//
// Server-side because all three finish on pages the browser pixel stays off
// (components/site-pixel.tsx). Each carries what Meta matches on: the _fbp and
// _fbc cookies the pixel set on the public pages, and for an account, its
// email hashed. Nothing about the business, its plan or its answers is sent.
//
// Which pixel: NEXT_PUBLIC_META_PIXEL_ID with META_CONVERSIONS_TOKEN when
// they're set in the deployment; otherwise the one set up from AIOS → Setup
// with one press — a pixel in the ad account MAIRO's own business has
// connected, reported to with that connection (siteTarget()). Off when
// neither, and never for a browser that sent Global Privacy Control or Do Not
// Track. Never throws: measurement doesn't get to break a sign-up or a payment.

export type SiteEvent = "Lead" | "CompleteRegistration" | "StartTrial" | "Subscribe";

/** The click ids carried from checkout to the webhook in subscription metadata. */
export type AdClickIds = { fbp?: string; fbc?: string };

/** MAIRO's own pixel id, or null. Digits only, so a pasted snippet can't reach the page. */
export function sitePixelId(): string | null {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  return id && /^\d{6,20}$/.test(id) ? id : null;
}

export function siteConversionsConfigured(): boolean {
  return Boolean(sitePixelId() && process.env.META_CONVERSIONS_TOKEN?.trim());
}

/** The SiteSetting naming the business whose pixel and Meta connection MAIRO measures itself with. */
export const SITE_PIXEL_SETTING = "site_pixel_org";

export type SiteTarget = { pixelId: string; token: string | null; source: "env" | "aios" };

let cachedTarget: { at: number; value: SiteTarget | null } | null = null;
const TARGET_TTL_MS = 60_000;

/**
 * MAIRO's own pixel and the token to report to it with, or null when
 * measurement is off. The deployment's variables win; otherwise the pixel set
 * up from AIOS, read from the database at most once a minute per server.
 */
export async function siteTarget(): Promise<SiteTarget | null> {
  const envId = sitePixelId();
  if (envId) return { pixelId: envId, token: process.env.META_CONVERSIONS_TOKEN?.trim() || null, source: "env" };
  if (cachedTarget && Date.now() - cachedTarget.at < TARGET_TTL_MS) return cachedTarget.value;
  let value: SiteTarget | null = null;
  try {
    const setting = await db.siteSetting.findUnique({ where: { key: SITE_PIXEL_SETTING } });
    if (setting) {
      const pixel = await db.trackingPixel.findUnique({
        where: { organizationId_platform: { organizationId: setting.value, platform: "META" } },
        select: { externalPixelId: true },
      });
      if (pixel && /^\d{6,20}$/.test(pixel.externalPixelId)) {
        const creds = await loadCredentials(setting.value, "META").catch(() => null);
        value = { pixelId: pixel.externalPixelId, token: creds?.status === "CONNECTED" ? creds.accessToken : null, source: "aios" };
      }
    }
  } catch {
    value = null;
  }
  cachedTarget = { at: Date.now(), value };
  return value;
}

/** After AIOS changes the setting, so this server doesn't wait out the cache. */
export function forgetSiteTarget(): void {
  cachedTarget = null;
}

/** Whether MAIRO's own conversions are being reported — from either source. */
export async function siteConversionsOn(): Promise<boolean> {
  const t = await siteTarget();
  return Boolean(t?.token);
}

// Meta's own formats: fb.<subdomain index>.<time>.<value>. Anything else is
// somebody else's cookie, or somebody's experiment, and isn't forwarded.
const FB_COOKIE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.-]{1,500}$/;

/** Whether this request's browser asked not to be tracked. */
export async function requestOptedOut(): Promise<boolean> {
  try {
    const h = await headers();
    return h.get("sec-gpc") === "1" || h.get("dnt") === "1";
  } catch {
    return true;
  }
}

/** The pixel's cookies on this request, when they look like Meta's. Empty for an opted-out browser. */
export async function adClickIds(): Promise<AdClickIds> {
  if (!(await siteConversionsOn()) || (await requestOptedOut())) return {};
  try {
    const jar = await cookies();
    const fbp = jar.get("_fbp")?.value;
    const fbc = jar.get("_fbc")?.value;
    return {
      ...(fbp && FB_COOKIE.test(fbp) ? { fbp } : {}),
      ...(fbc && FB_COOKIE.test(fbc) ? { fbc } : {}),
    };
  } catch {
    return {};
  }
}

async function requestDetails(): Promise<{ clientIp?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const clientIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
    const userAgent = h.get("user-agent")?.slice(0, 500) || undefined;
    return { clientIp, userAgent };
  } catch {
    return {};
  }
}

type Report = {
  event: SiteEvent;
  /** Stable per real-world step, so a retry is the same event to Meta. */
  eventId: string;
  /** The page the step belongs to, without a query string. */
  path: string;
  email?: string | null;
  clickIds?: AdClickIds;
  valueCents?: number;
  /** From a request, or from a webhook that has none. */
  fromRequest: boolean;
};

export async function reportSiteEvent(r: Report): Promise<void> {
  try {
    const target = await siteTarget();
    if (!target?.token) return;
    const { pixelId, token } = target;
    if (r.fromRequest && (await requestOptedOut())) return;
    const details = r.fromRequest ? await requestDetails() : {};
    const result = await sendMetaConversions(
      pixelId,
      token,
      [
        {
          eventName: r.event,
          eventId: r.eventId,
          eventTime: new Date(),
          valueCents: r.valueCents ?? 0,
          currency: "usd",
          hashedEmail: hashEmail(r.email),
          fbp: r.clickIds?.fbp ?? null,
          fbc: r.clickIds?.fbc ?? null,
          clientIp: details.clientIp ?? null,
          userAgent: details.userAgent ?? null,
          sourceUrl: `${siteUrl()}${r.path}`,
        },
      ],
      process.env.META_CONVERSIONS_TEST_CODE?.trim() || null
    );
    if (result.messages.length) console.warn(`[site-tracking] ${r.event}: Meta said ${result.messages.join(" | ")}`);
  } catch (error) {
    // The event, never the identifiers.
    console.error(`[site-tracking] couldn't send ${r.event}:`, error instanceof Error ? error.message : error);
    await reportError(error, { where: "site-tracking", level: "warning", tags: { event: r.event } });
  }
}

/** The email of whoever owns a business, for a step reported without a request. */
export async function ownerEmail(organizationId: string): Promise<string | null> {
  try {
    const member = await db.organizationMember.findFirst({
      where: { organizationId, role: "OWNER" },
      orderBy: { createdAt: "asc" },
      select: { user: { select: { email: true } } },
    });
    return member?.user.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Runs a report after the response, so Meta's answer never holds up a page or
 * a webhook. Outside a request (a script calling applySubscription) there is
 * no "after", and it simply runs in the background.
 */
export function later(task: () => Promise<void>): void {
  // Off by the deployment's variables, with no AIOS pixel possible to look
  // up cheaply here: the wrapper asks, after the response.
  if (sitePixelId() && !siteConversionsConfigured()) return;
  const run = async () => {
    if (await siteConversionsOn()) await task();
  };
  try {
    after(run);
  } catch {
    void run().catch(() => undefined);
  }
}
