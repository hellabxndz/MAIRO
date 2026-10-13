import { db } from "@/lib/db";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import { MetaApiError } from "@/lib/meta/client";
import { createMetaPixel, fetchMetaPixel, fetchPixelEventCounts, listMetaPixels, type MetaPixel } from "@/lib/tracking/meta-pixel";
import { ensureTrackingProfile } from "@/lib/tracking/profile";
import { pixelStatusFrom } from "@/lib/tracking/pixels";
import { nicheById } from "@/lib/tracking/niches";
import { scanWebsite } from "@/lib/website/scan";
import { latestOrgScan } from "@/lib/website/store";
import { campaignHandoff, consentPolicyFrom, routeFrom, suggestedRoute, trackingStage, type CheckRecord, type CheckStatus, type ConsentPolicy, type InstallRoute, type StageView } from "@/lib/tracking/state";

// The tracking workflow behind "Help your ad platform understand when someone
// becomes a lead or customer":
//
//   1. See the pixels the business already has, with who owns each, and pick
//      one — reusing one keeps its history. Or ask MAIRO to create one.
//   2. Install it, by the route that suits the website.
//   3. Check: is the code on the site, and is Meta receiving the event the
//      campaign will be judged on?
//
// Rules this file keeps:
//   - Nothing is chosen or created without the owner asking.
//   - Success is only reported with an id Meta returned and then confirmed.
//   - Creating is idempotent: a lease stops a double click or a second tab
//     making two, and a pixel made by an attempt that didn't finish saving is
//     found and used rather than duplicated.
//   - "Not detected", "not seen" and "missing permission" are answers, kept
//     apart from failures (lib/tracking/state.ts).
//   - Everything is read and written for one organization at a time.

const LEASE_MS = 2 * 60 * 1000;
const EVENT_WINDOW_DAYS = 7;

export type SetupError = { reason: "not_connected" | "missing_permission" | "in_progress" | "not_found" | "failed"; message: string };
export type SetupResult<T> = { ok: true; data: T } | ({ ok: false } & SetupError);

const err = <T,>(reason: SetupError["reason"], message: string): SetupResult<T> => ({ ok: false, reason, message });

/** Meta's permission and token errors, told apart from everything else. */
export function classifyMetaError(e: unknown): SetupError {
  if (e instanceof MetaApiError) {
    const body = e.body as { error?: { code?: number; error_subcode?: number } } | undefined;
    const code = body?.error?.code;
    if (code === 190) return { reason: "not_connected", message: "Your Meta connection has expired. Reconnect Meta and try again." };
    if (code === 10 || code === 200 || (code !== undefined && code >= 200 && code < 300) || code === 294) {
      return { reason: "missing_permission", message: "Your Meta connection isn't allowed to do this. Reconnect Meta and grant access to the ad account and its pixels." };
    }
    return { reason: "failed", message: "Meta didn't accept the request. Try again in a minute." };
  }
  return { reason: "failed", message: "Couldn't reach Meta. Try again in a minute." };
}

async function metaCreds(organizationId: string) {
  const creds = await loadCredentials(organizationId, "META");
  if (!creds || creds.status !== "CONNECTED") return null;
  return creds;
}

export type PixelChoice = {
  id: string;
  name: string;
  ownerBusiness: { id: string; name: string } | null;
  lastFiredAt: Date | null;
  createdAt: Date | null;
  unavailable: boolean;
  recommended: boolean;
  why: string;
};

/** Orders the pixels so the one worth reusing comes first, and says why. Pure. */
export function rankPixels(pixels: MetaPixel[], now = new Date()): PixelChoice[] {
  const fresh = (p: MetaPixel) => (p.lastFiredAt ? now.getTime() - p.lastFiredAt.getTime() < 30 * 864e5 : false);
  const sorted = [...pixels].sort((a, b) => {
    if (Boolean(a.unavailable) !== Boolean(b.unavailable)) return a.unavailable ? 1 : -1;
    const af = a.lastFiredAt?.getTime() ?? 0;
    const bf = b.lastFiredAt?.getTime() ?? 0;
    if (af !== bf) return bf - af;
    return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
  });
  const best = sorted.find((p) => !p.unavailable) ?? null;
  return sorted.map((p) => ({
    id: p.id,
    name: p.name,
    ownerBusiness: p.ownerBusiness ?? null,
    lastFiredAt: p.lastFiredAt,
    createdAt: p.createdAt ?? null,
    unavailable: Boolean(p.unavailable),
    recommended: p === best,
    why: p.unavailable
      ? "Meta marks this pixel as unavailable, so it can't be used."
      : fresh(p)
        ? "Received events in the last 30 days — reusing it keeps that history."
        : p.lastFiredAt
          ? "Has received events before, but not in the last 30 days."
          : "Has never received an event.",
  }));
}

export async function listPixelChoices(organizationId: string): Promise<SetupResult<{ choices: PixelChoice[]; adAccountId: string }>> {
  const creds = await metaCreds(organizationId);
  if (!creds) return err("not_connected", "Connect Meta first — pixels live in your ad account.");
  try {
    const pixels = await listMetaPixels(creds.externalAccountId, creds.accessToken);
    return { ok: true, data: { choices: rankPixels(pixels), adAccountId: creds.externalAccountId } };
  } catch (e) {
    const c = classifyMetaError(e);
    return { ok: false, ...c };
  }
}

async function savePixel(organizationId: string, userId: string, pixel: MetaPixel, origin: "EXISTING" | "CREATED_BY_MAIRO") {
  const data = {
    externalPixelId: pixel.id,
    name: pixel.name,
    origin,
    ownerBusinessId: pixel.ownerBusiness?.id ?? null,
    ownerBusinessName: pixel.ownerBusiness?.name ?? null,
    selectedAt: new Date(),
    selectedById: userId,
    status: pixelStatusFrom(pixel.lastFiredAt),
    lastFiredAt: pixel.lastFiredAt,
    lastCheckedAt: new Date(),
    lastError: null,
  };
  return db.trackingPixel.upsert({
    where: { organizationId_platform: { organizationId, platform: "META" } },
    create: { organizationId, platform: "META", ...data },
    update: data,
  });
}

/** Uses a pixel the owner picked. Meta confirms it before anything is saved. */
export async function selectPixel(organizationId: string, userId: string, pixelId: string): Promise<SetupResult<{ id: string; name: string }>> {
  const id = pixelId.trim();
  if (!/^\d{6,30}$/.test(id)) return err("not_found", "That doesn't look like a Meta pixel ID — it's a long number.");
  const creds = await metaCreds(organizationId);
  if (!creds) return err("not_connected", "Connect Meta first.");
  try {
    const pixel = await fetchMetaPixel(id, creds.accessToken);
    if (!pixel?.id || pixel.id !== id) return err("not_found", "Meta didn't confirm that pixel for your connection.");
    if (pixel.unavailable) return err("failed", "Meta marks that pixel as unavailable. Choose another, or create one.");
    const row = await savePixel(organizationId, userId, pixel, "EXISTING");
    return { ok: true, data: { id: row.externalPixelId, name: row.name } };
  } catch (e) {
    const c = classifyMetaError(e);
    return { ok: false, ...c, message: c.reason === "failed" ? "Meta couldn't find that pixel for your connection. Check the ID, or that this ad account can use it." : c.message };
  }
}

/**
 * Creates a pixel in the business's own ad account, because the owner asked.
 *
 * One at a time per business (a lease on the tracking profile), and safe to
 * retry: if an earlier attempt created the pixel on Meta but didn't get as far
 * as saving it, the pixel with the same name made in the last few minutes is
 * used instead of a second one. Reported as done only once Meta has returned
 * an id and confirmed it on a fresh read.
 */
export async function createPixel(organizationId: string, userId: string, businessName: string): Promise<SetupResult<{ id: string; name: string; reused: boolean }>> {
  const existing = await db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } });
  if (existing) return { ok: true, data: { id: existing.externalPixelId, name: existing.name, reused: true } };
  const creds = await metaCreds(organizationId);
  if (!creds) return err("not_connected", "Connect Meta first — the pixel is created in your ad account.");

  await ensureTrackingProfile(organizationId);
  const now = new Date();
  const lease = await db.trackingProfile.updateMany({
    where: { organizationId, OR: [{ pixelCreateStartedAt: null }, { pixelCreateStartedAt: { lt: new Date(now.getTime() - LEASE_MS) } }] },
    data: { pixelCreateStartedAt: now },
  });
  if (lease.count === 0) return err("in_progress", "MAIRO is already creating a pixel for you. Give it a moment, then refresh.");

  const name = `${businessName} — MAIRO`.slice(0, 50);
  try {
    // An earlier attempt may have created it and then lost the reply.
    const recent = (await listMetaPixels(creds.externalAccountId, creds.accessToken)).find(
      (p) => p.name === name && p.createdAt && now.getTime() - p.createdAt.getTime() < 15 * 60 * 1000,
    );
    let pixel: MetaPixel;
    let reused = false;
    if (recent) {
      pixel = recent;
      reused = true;
    } else {
      const made = await createMetaPixel(creds.externalAccountId, creds.accessToken, name);
      if (!made.id) return err("failed", "Meta didn't return an ID for the new pixel, so nothing was saved.");
      pixel = made;
    }
    // Confirm on a fresh read before telling anyone it exists.
    const confirmed = await fetchMetaPixel(pixel.id, creds.accessToken);
    if (!confirmed?.id || confirmed.id !== pixel.id) return err("failed", "Meta didn't confirm the new pixel yet. Check again in a minute — MAIRO won't create a second one.");
    const row = await savePixel(organizationId, userId, confirmed, "CREATED_BY_MAIRO");
    return { ok: true, data: { id: row.externalPixelId, name: row.name, reused } };
  } catch (e) {
    const c = classifyMetaError(e);
    return { ok: false, ...c };
  } finally {
    await db.trackingProfile.updateMany({ where: { organizationId, pixelCreateStartedAt: now }, data: { pixelCreateStartedAt: null } });
  }
}

async function record(organizationId: string, pixelId: string, check: string, r: Omit<CheckRecord, "checkedAt">, window?: { start: Date; end: Date }) {
  await db.trackingVerification.create({
    data: { organizationId, pixelId, check, status: r.status, source: r.source, detail: r.detail, count: r.count, windowStart: window?.start ?? null, windowEnd: window?.end ?? null },
  });
}

/**
 * Is the pixel on the website? Two independent answers: MAIRO's own reading
 * of the public pages (does the page load this pixel id?) and Meta's (has it
 * ever seen an event from it?). Either is proof; neither is "not detected",
 * which is an answer, not a failure.
 */
export async function checkInstallation(organizationId: string): Promise<SetupResult<CheckRecord>> {
  const pixel = await db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } });
  if (!pixel) return err("not_found", "Choose or create a pixel first.");

  const creds = await metaCreds(organizationId);
  if (creds) {
    try {
      const fresh = await fetchMetaPixel(pixel.externalPixelId, creds.accessToken);
      if (fresh.lastFiredAt) {
        await db.trackingPixel.update({ where: { id: pixel.id }, data: { lastFiredAt: fresh.lastFiredAt, status: pixelStatusFrom(fresh.lastFiredAt), lastCheckedAt: new Date(), lastError: null } });
        const r = { status: "VERIFIED" as const, source: "meta_last_fired" as const, detail: `Meta last received an event from this pixel on ${fresh.lastFiredAt.toISOString()}.`, count: null };
        await record(organizationId, pixel.externalPixelId, "install", r);
        return { ok: true, data: { ...r, checkedAt: new Date() } };
      }
    } catch {
      // Fall through to the website reading; Meta's answer isn't the only one.
    }
  }

  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { website: true } });
  if (!org?.website) {
    const r = { status: "NOT_DETECTED" as const, source: "public_scan" as const, detail: "No website on file to look at, and Meta hasn't received an event from this pixel yet.", count: null };
    await record(organizationId, pixel.externalPixelId, "install", r);
    return { ok: true, data: { ...r, checkedAt: new Date() } };
  }
  const { result } = await scanWebsite(org.website, { measureSpeed: false });
  if (result.status === "FAILED" || result.status === "BLOCKED") {
    const r = { status: "FAILED" as const, source: "public_scan" as const, detail: result.error ?? "MAIRO couldn't read your website.", count: null };
    await record(organizationId, pixel.externalPixelId, "install", r);
    return { ok: true, data: { ...r, checkedAt: new Date() } };
  }
  const onPage = result.tracking.metaPixelIds.includes(pixel.externalPixelId);
  const r: Omit<CheckRecord, "checkedAt"> = onPage
    ? { status: "VERIFIED", source: "public_scan", detail: `Found pixel ${pixel.externalPixelId} on ${result.finalUrl ?? org.website}.`, count: null }
    : {
        status: "NOT_DETECTED",
        source: "public_scan",
        detail: result.tracking.shopifyWebPixels
          ? "Not found in the page code — but Shopify runs pixels in a sandbox a page check can't see. Use the event check instead."
          : result.tracking.metaPixelIds.length
            ? `The website loads a different pixel (${result.tracking.metaPixelIds.join(", ")}). Either install this one, or choose that one above.`
            : "The pages MAIRO read don't load this pixel yet.",
        count: null,
      };
  await record(organizationId, pixel.externalPixelId, "install", r);
  return { ok: true, data: { ...r, checkedAt: new Date() } };
}

/** Has Meta received these events from the pixel in the last week? One record per event. */
export async function checkEvents(organizationId: string, events: string[]): Promise<SetupResult<Record<string, CheckRecord>>> {
  const pixel = await db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } });
  if (!pixel) return err("not_found", "Choose or create a pixel first.");
  const creds = await metaCreds(organizationId);
  if (!creds) return err("not_connected", "Connect Meta first.");
  const end = new Date();
  const start = new Date(end.getTime() - EVENT_WINDOW_DAYS * 864e5);
  const out: Record<string, CheckRecord> = {};
  try {
    const counts = await fetchPixelEventCounts(pixel.externalPixelId, creds.accessToken, start);
    for (const e of events) {
      const n = counts[e] ?? 0;
      const r: Omit<CheckRecord, "checkedAt"> = n > 0 ? { status: "VERIFIED", source: "meta_stats", detail: `Meta received ${n} ${e} event${n === 1 ? "" : "s"} in the last ${EVENT_WINDOW_DAYS} days.`, count: n } : { status: "NOT_SEEN", source: "meta_stats", detail: `Meta received no ${e} events in the last ${EVENT_WINDOW_DAYS} days.`, count: 0 };
      await record(organizationId, pixel.externalPixelId, `event:${e}`, r, { start, end });
      out[e] = { ...r, checkedAt: end };
    }
    return { ok: true, data: out };
  } catch (e) {
    const c = classifyMetaError(e);
    const status: CheckStatus = c.reason === "missing_permission" ? "MISSING_PERMISSION" : "FAILED";
    for (const ev of events) {
      const r = { status, source: "meta_stats" as const, detail: c.message, count: null };
      await record(organizationId, pixel.externalPixelId, `event:${ev}`, r, { start, end });
      out[ev] = { ...r, checkedAt: end };
    }
    return { ok: true, data: out };
  }
}

export async function setInstallRoute(organizationId: string, route: InstallRoute) {
  await ensureTrackingProfile(organizationId);
  await db.trackingProfile.update({ where: { organizationId }, data: { installRoute: route } });
}

export async function markInstalled(organizationId: string) {
  await ensureTrackingProfile(organizationId);
  await db.trackingProfile.update({ where: { organizationId }, data: { installMarkedAt: new Date() } });
}

export async function setConsentPolicy(organizationId: string, policy: ConsentPolicy) {
  await ensureTrackingProfile(organizationId);
  await db.trackingProfile.update({ where: { organizationId }, data: { serverEventsConsent: policy } });
}

/** The event the first campaign is judged on, from the business type; null when a Meta lead form makes a pixel unnecessary to start. */
export function requiredEventFor(nicheId: string, opts: { usesLeadForm?: boolean } = {}): string | null {
  if (opts.usesLeadForm) return null;
  const niche = nicheById(nicheId);
  const primary = niche.actions.find((a) => a.primary) ?? niche.actions[0];
  return primary?.metaEvent ?? "Lead";
}

export type TrackingOverview = {
  pixel: { id: string; name: string; origin: string; ownerBusinessName: string | null; lastFiredAt: Date | null; selectedAt: Date | null } | null;
  stage: StageView;
  requiredEvent: string | null;
  install: CheckRecord | null;
  events: Record<string, CheckRecord>;
  route: InstallRoute | null;
  suggestedRoute: InstallRoute;
  detectedPlatform: string | null;
  installMarkedAt: Date | null;
  consent: ConsentPolicy;
  handoff: ReturnType<typeof campaignHandoff>;
  creating: boolean;
};

/** Everything the tracking card shows, for one organization. */
export async function trackingOverview(organizationId: string): Promise<TrackingOverview> {
  const [pixel, profile, scan] = await Promise.all([
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } }),
    ensureTrackingProfile(organizationId),
    latestOrgScan(organizationId).catch(() => null),
  ]);
  const requiredEvent = requiredEventFor(profile.nicheId);
  const checks = pixel
    ? await db.trackingVerification.findMany({ where: { organizationId, pixelId: pixel.externalPixelId }, orderBy: { checkedAt: "desc" }, take: 40 })
    : [];
  const latest = (check: string): CheckRecord | null => {
    const r = checks.find((c) => c.check === check);
    return r ? { status: r.status as CheckStatus, source: r.source as CheckRecord["source"], detail: r.detail, count: r.count, checkedAt: r.checkedAt } : null;
  };
  const events: Record<string, CheckRecord> = {};
  for (const c of checks) {
    if (!c.check.startsWith("event:")) continue;
    const name = c.check.slice(6);
    if (!events[name]) events[name] = latest(c.check)!;
  }
  const install = latest("install");
  const route = routeFrom(profile.installRoute);
  const detectedPlatform = scan?.result.platform?.name ?? null;
  const stage = trackingStage({
    pixel: pixel ? { id: pixel.externalPixelId, lastFiredAt: pixel.lastFiredAt } : null,
    installRoute: route,
    installMarkedAt: profile.installMarkedAt,
    install,
    requiredEvent,
    events,
  });
  return {
    pixel: pixel ? { id: pixel.externalPixelId, name: pixel.name, origin: pixel.origin, ownerBusinessName: pixel.ownerBusinessName, lastFiredAt: pixel.lastFiredAt, selectedAt: pixel.selectedAt } : null,
    stage,
    requiredEvent,
    install,
    events,
    route,
    suggestedRoute: suggestedRoute(detectedPlatform),
    detectedPlatform,
    installMarkedAt: profile.installMarkedAt,
    consent: consentPolicyFrom(profile.serverEventsConsent),
    handoff: campaignHandoff(stage.stage, requiredEvent),
    creating: Boolean(profile.pixelCreateStartedAt && Date.now() - profile.pixelCreateStartedAt.getTime() < LEASE_MS),
  };
}
