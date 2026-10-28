import { generateText } from "ai";
import { db } from "@/lib/db";
import { agentModel } from "@/lib/ai/model";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import { resolveHost, urlProblem } from "@/lib/net/safe-fetch";
import { siteUrl } from "@/lib/site";
import { scanWebsite } from "@/lib/website/scan";
import { latestOrgScan, saveScan, takeScanQuota } from "@/lib/website/store";
import { ensureTrackingProfile } from "@/lib/tracking/profile";
import { fetchPixelEventCounts, fetchPixelEventFields } from "@/lib/tracking/meta-pixel";
import { checkEvents, classifyMetaError, setInstallRoute } from "@/lib/tracking/setup";
import { loadPixelSetup, type PixelSetupView } from "@/lib/tracking/pixel-setup";
import { sellsOnline, leadMeasurementFrom } from "@/lib/tracking/pixel-rules";
import { tagSnippet } from "@/lib/tracking/smart-tag";
import { routeFrom, type CheckRecord, type CheckStatus, type InstallRoute } from "@/lib/tracking/state";
import {
  GOALS,
  MEASUREMENT_DEPENDENCIES,
  acceptAiSuggestion,
  developerNotes,
  eventsFor,
  goalsFrom,
  installPlan,
  measurementReport,
  platformFrom,
  platformGuess,
  setupState,
  suggestGoals,
  validateGoals,
  type GoalId,
  type InstallPlan,
  type MeasuredEvent,
  type MeasurementReport,
  type SitePlatform,
  type StateView,
  type Suggestion,
} from "@/lib/tracking/measurement";

// The guided tracking setup's records, for one business at a time: what they
// chose to measure, their website and its platform, putting setup off, and
// the per-event checks with Meta. The rules live in lib/tracking/measurement.ts;
// choosing and creating the Pixel stay in lib/tracking/pixel-setup.ts and
// lib/tracking/setup.ts, which this reuses rather than repeats.
//
// Every function takes an organization id and reads and writes that business
// only. Access tokens never leave the server and are never logged.

const WINDOW_DAYS = 7;

export type MeasurementView = {
  website: string | null;
  platform: {
    confirmed: SitePlatform | null;
    guess: { platform: SitePlatform; confidence: "certain" | "likely"; evidence: string | null } | null;
    /** When MAIRO last read the website. */
    readAt: string | null;
  };
  goals: GoalId[];
  goalsSavedAt: string | null;
  suggestion: Suggestion;
  deferredAt: string | null;
  pixel: PixelSetupView;
  state: StateView;
  installRoute: InstallRoute | null;
  installMarkedAt: string | null;
  plan: InstallPlan | null;
  snippet: string | null;
  developerNotes: string | null;
  checks: Partial<Record<MeasuredEvent, { status: CheckStatus; detail: string | null; count: number | null; checkedAt: string; source: string }>>;
  purchaseParams: { status: CheckStatus; detail: string | null; checkedAt: string } | null;
  dedup: Partial<Record<MeasuredEvent, { status: CheckStatus; detail: string | null; checkedAt: string }>>;
  report: MeasurementReport;
  dependencies: typeof MEASUREMENT_DEPENDENCIES;
  /** Other kinds of website tracking MAIRO saw, so nothing gets installed twice. */
  existingTracking: { metaPixelIds: string[]; mairoTag: boolean; gtm: string[]; shopifyWebPixels: boolean } | null;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

type CheckRow = { check: string; status: string; source: string; detail: string | null; count: number | null; checkedAt: Date; windowStart: Date | null; windowEnd: Date | null };
const asRecord = (r: CheckRow): CheckRecord & { windowStart: Date | null; windowEnd: Date | null } => ({
  status: r.status as CheckStatus,
  source: r.source as CheckRecord["source"],
  detail: r.detail,
  count: r.count,
  checkedAt: r.checkedAt,
  windowStart: r.windowStart,
  windowEnd: r.windowEnd,
});

/** Everything the guided page shows. Database only — no call to Meta or the website. */
export async function loadMeasurementSetup(organizationId: string): Promise<MeasurementView> {
  const [org, profile, pixelRow, pixel, scan, ingest] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { website: true } }),
    ensureTrackingProfile(organizationId),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } }),
    loadPixelSetup(organizationId),
    latestOrgScan(organizationId).catch(() => null),
    db.storeIngest.findUnique({ where: { organizationId }, select: { lastReceivedAt: true } }),
  ]);
  const goals = profile.measurementGoalsSavedAt ? goalsFrom(profile.measurementGoals) : [];
  const site = scan?.result ?? null;
  const suggestion = suggestGoals({
    sellsOnline: sellsOnline(profile.nicheId),
    leadMeasurement: leadMeasurementFrom(profile.leadMeasurement),
    site: site
      ? { forms: site.destinations.forms.length > 0, phoneLinks: site.destinations.phoneLinks.length > 0, booking: site.destinations.booking.length > 0, checkout: site.destinations.checkout, cart: site.destinations.cart }
      : null,
  });

  const rows: CheckRow[] = pixelRow
    ? await db.trackingVerification.findMany({ where: { organizationId, pixelId: pixelRow.externalPixelId }, orderBy: { checkedAt: "desc" }, take: 80 })
    : [];
  const latest = (check: string) => rows.find((r) => r.check === check) ?? null;
  const eventChecks: Partial<Record<MeasuredEvent, ReturnType<typeof asRecord>>> = {};
  const dedup: MeasurementView["dedup"] = {};
  for (const e of eventsFor(goals)) {
    const r = latest(`event:${e}`);
    if (r) eventChecks[e] = asRecord(r);
    const d = latest(`dedup:${e}`);
    if (d) dedup[e] = { status: d.status as CheckStatus, detail: d.detail, checkedAt: d.checkedAt.toISOString() };
  }
  const params = latest("params:Purchase");
  const install = latest("install");

  const state = setupState({
    goals,
    goalsSavedAt: profile.measurementGoalsSavedAt,
    deferredAt: profile.setupDeferredAt,
    pixel: pixelRow ? { lastFiredAt: pixelRow.lastFiredAt, accessLost: pixel.status === "access_lost", otherAdAccount: false } : null,
    installVerified: install?.status === "VERIFIED",
    installRoute: profile.installRoute,
    installMarkedAt: profile.installMarkedAt,
    events: eventChecks,
    purchaseParams: params ? asRecord(params) : null,
  });

  const confirmed = platformFrom(profile.sitePlatform);
  const guess = platformGuess(site?.platform ?? null);
  const plan = confirmed && goals.length ? installPlan(confirmed, goals) : null;
  const snippet = pixelRow ? tagSnippet(siteUrl(), pixelRow.id) : null;

  // Store orders: what the store reported, counted as orders, over the same 7 days.
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5);
  const orders = await db.conversionEvent.findMany({ where: { organizationId, eventName: "Purchase", occurredAt: { gte: since } }, select: { valueCents: true, currency: true } });
  const currency = orders[0]?.currency ?? "USD";
  const storeOrders = orders.length
    ? { count: orders.length, revenueCents: orders.filter((o) => o.currency === currency).reduce((a, o) => a + o.valueCents, 0), currency, window: { start: since, end: new Date() }, lastReceivedAt: ingest?.lastReceivedAt ?? null }
    : null;

  return {
    website: org?.website ?? null,
    platform: { confirmed, guess: guess ? { ...guess, evidence: site?.platform?.evidence[0]?.what ?? null } : null, readAt: iso(scan?.createdAt) },
    goals,
    goalsSavedAt: iso(profile.measurementGoalsSavedAt),
    suggestion,
    deferredAt: iso(profile.setupDeferredAt),
    pixel,
    state,
    installRoute: routeFrom(profile.installRoute),
    installMarkedAt: iso(profile.installMarkedAt),
    plan,
    snippet,
    developerNotes: pixelRow && goals.length ? developerNotes({ pixelId: pixelRow.externalPixelId, snippet: plan?.method === "mairo_tag" ? snippet : null, goals, website: org?.website ?? null }) : null,
    checks: Object.fromEntries(
      Object.entries(eventChecks).map(([e, c]) => [e, { status: c!.status, detail: c!.detail, count: c!.count, checkedAt: c!.checkedAt.toISOString(), source: c!.source }]),
    ) as MeasurementView["checks"],
    purchaseParams: params ? { status: params.status as CheckStatus, detail: params.detail, checkedAt: params.checkedAt.toISOString() } : null,
    dedup,
    report: measurementReport({ goals, checks: eventChecks, storeOrders }),
    dependencies: MEASUREMENT_DEPENDENCIES,
    existingTracking: site
      ? { metaPixelIds: site.tracking.metaPixelIds, mairoTag: (site.tracking.mairoTagIds ?? []).length > 0, gtm: site.tracking.gtmContainers, shopifyWebPixels: site.tracking.shopifyWebPixels }
      : null,
  };
}

// --- the website -------------------------------------------------------------------

export type WebsiteResult = { ok: true; website: string; guess: MeasurementView["platform"]["guess"]; readable: boolean; message: string } | { ok: false; message: string };

const PROBLEM: Record<string, string> = {
  "not-a-url": "That doesn't look like a website address — try something like yourshop.com.",
  scheme: "Use an address starting with http:// or https://.",
  credentials: "Leave out any username or password in the address.",
  port: "Use your website's normal address, without a port number.",
  "local-name": "That's a private or local address, not a public website.",
  "private-address": "That's a private or local address, not a public website.",
};

/** A public website address, normalised, or why not. Pure apart from DNS. */
export async function normaliseWebsite(raw: string): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const trimmed = raw.trim().slice(0, 300);
  if (!trimmed) return { ok: false, message: "Enter your website's address." };
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const problem = urlProblem(candidate);
  if (problem) return { ok: false, message: PROBLEM[problem] ?? "That address can't be used." };
  const u = new URL(candidate);
  if (!u.hostname.includes(".")) return { ok: false, message: "That doesn't look like a public website address." };
  // Fixture hosts (.fixture.test) are for local checks; everything else must resolve to public addresses only.
  if (!u.hostname.endsWith(".fixture.test")) {
    const resolved = await resolveHost(u.hostname);
    if (resolved === "private") return { ok: false, message: PROBLEM["private-address"] };
    if (resolved === "unresolved") return { ok: false, message: "MAIRO couldn't find that website. Check the spelling." };
  }
  return { ok: true, url: `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "")}` };
}

/**
 * Saves the website (only when the business has none, or the owner changes
 * it) and reads it to suggest the platform. Reading goes through the same
 * guarded fetch as every website reading: public addresses only, each
 * redirect checked. A website address authorises nothing: MAIRO only reads
 * its public pages.
 */
export async function saveWebsiteAndDetect(organizationId: string, raw: string): Promise<WebsiteResult> {
  const n = await normaliseWebsite(raw);
  if (!n.ok) return n;
  await db.organization.update({ where: { id: organizationId }, data: { website: n.url } });
  return detectPlatformFor(organizationId);
}

/** Reads the saved website again for its platform. Bounded by the business's reading quota. */
export async function detectPlatformFor(organizationId: string): Promise<WebsiteResult> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { website: true } });
  if (!org?.website) return { ok: false, message: "Add your website first." };
  const quota = await takeScanQuota({ organizationId });
  if (!quota.ok) return { ok: false, message: quota.message };
  const { result } = await scanWebsite(org.website, { measureSpeed: false });
  await saveScan({ result, source: "recheck", organizationId }).catch(() => null);
  const readable = result.status === "OK" || result.status === "PARTIAL";
  const guess = platformGuess(result.platform);
  return {
    ok: true,
    website: org.website,
    readable,
    guess: guess ? { ...guess, evidence: result.platform?.evidence[0]?.what ?? null } : null,
    message: !readable
      ? `MAIRO couldn't read ${org.website} (${result.error ?? "it didn't load"}). Choose your platform below.`
      : guess
        ? `It looks like ${guess.confidence === "certain" ? "" : "it might be "}a ${guess.platform === "other" ? result.platform?.name : guess.platform} website — please confirm.`
        : "MAIRO couldn't tell which platform your website uses. Choose it below.",
  };
}

/** The owner's answer to "which platform is your website on?" — saved, and the install route that goes with it. */
export async function confirmPlatform(organizationId: string, raw: string): Promise<{ ok: true; platform: SitePlatform } | { ok: false; message: string }> {
  const platform = platformFrom(raw);
  if (!platform) return { ok: false, message: "Choose one of the options." };
  await ensureTrackingProfile(organizationId);
  await db.trackingProfile.update({ where: { organizationId }, data: { sitePlatform: platform, sitePlatformConfirmedAt: new Date() } });
  return { ok: true, platform };
}

// --- what to measure ----------------------------------------------------------------

/** Saves the owner's choice. Only ids from the fixed list are kept; at least one is needed. */
export async function saveGoals(organizationId: string, userId: string, raw: unknown): Promise<{ ok: true; goals: GoalId[]; dropped: string[] } | { ok: false; message: string }> {
  const { goals, dropped } = validateGoals(raw);
  if (goals.length === 0) return { ok: false, message: "Choose at least one thing to measure — or set this up later." };
  const profile = await ensureTrackingProfile(organizationId);
  const wantsPixel = goals.some((g) => GOALS[g].source === "pixel");
  await db.trackingProfile.update({
    where: { organizationId },
    data: {
      measurementGoals: JSON.stringify(goals),
      measurementGoalsSavedAt: new Date(),
      measurementGoalsById: userId,
      setupDeferredAt: null,
      // Choosing website events is the answer to "use a Pixel?" changing from no.
      ...(wantsPixel && profile.pixelDecision === "declined" ? { pixelDecision: null } : {}),
    },
  });
  return { ok: true, goals, dropped };
}

/** "Set this up later." Recorded; anything that depends on measurement says it isn't set up. */
export async function deferSetup(organizationId: string): Promise<void> {
  await ensureTrackingProfile(organizationId);
  await db.trackingProfile.update({ where: { organizationId }, data: { setupDeferredAt: new Date() } });
}

export async function resumeSetup(organizationId: string): Promise<void> {
  await ensureTrackingProfile(organizationId);
  await db.trackingProfile.update({ where: { organizationId }, data: { setupDeferredAt: null } });
}

/** The install method the owner picked for their platform, as the route the rest of MAIRO knows. */
export async function chooseInstall(organizationId: string, plan: InstallPlan["method"], platform: SitePlatform): Promise<InstallRoute> {
  const route: InstallRoute =
    plan === "mairo_tag" ? "mairo_tag" : platform === "shopify" ? "shopify_app" : platform === "woocommerce" ? "wordpress_plugin" : platform === "wix" ? "wix" : platform === "squarespace" ? "squarespace" : "manual";
  await setInstallRoute(organizationId, route);
  return route;
}

/**
 * A suggestion from the AI, when it's available — checked against the fixed
 * list before anyone sees it. Never saved by itself: the owner saves. Falls
 * back to MAIRO's own rules when the AI isn't configured or says nothing usable.
 */
export async function suggestWithAi(organizationId: string): Promise<{ suggestion: Suggestion; dropped: string[] }> {
  const view = await loadMeasurementSetup(organizationId);
  const fallback = view.suggestion;
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return { suggestion: fallback, dropped: [] };
  const [org, profile] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, industry: true } }),
    ensureTrackingProfile(organizationId),
  ]);
  const scan = await latestOrgScan(organizationId).catch(() => null);
  const d = scan?.result.destinations;
  const facts = [
    `Business type: ${org?.industry ?? "not given"} (MAIRO's category: ${profile.nicheId})`,
    `Sells online: ${sellsOnline(profile.nicheId) ? "yes" : "no"}`,
    d ? `Website has: ${[d.checkout && "a checkout", d.cart && "a cart", d.forms.length && "an enquiry form", d.phoneLinks.length && "a tap-to-call number", d.booking.length && "a booking link"].filter(Boolean).join(", ") || "none of checkout, cart, form, phone link or booking link"}` : "Website: not read",
    `How leads come in (owner said): ${profile.leadMeasurement ?? "not said"}`,
  ].join("\n");
  const allowed = Object.values(GOALS).map((g) => `${g.id}: ${g.label} — ${g.detail}`).join("\n");
  try {
    const { text } = await generateText({
      model: agentModel,
      maxOutputTokens: 400,
      abortSignal: AbortSignal.timeout(12_000),
      system:
        "You suggest which conversions a small business should measure with Meta. Choose only from the allowed ids. Never invent ids or event names. Don't claim anything is installed or working. Reply with JSON only: {\"goals\": [ids], \"why\": {id: one short sentence}}.",
      prompt: `Facts about the business:\n${facts}\n\nAllowed ids:\n${allowed}`,
    });
    return acceptAiSuggestion(text, fallback);
  } catch {
    return { suggestion: fallback, dropped: [] };
  }
}

// --- verifying with Meta ------------------------------------------------------------

export type VerifyResult = { ok: true; checked: MeasuredEvent[]; verified: MeasuredEvent[]; message: string } | { ok: false; reason: string; message: string };

async function record(organizationId: string, pixelId: string, check: string, r: { status: CheckStatus; source: CheckRecord["source"]; detail: string; count?: number | null }, window: { start: Date; end: Date }) {
  await db.trackingVerification.create({
    data: { organizationId, pixelId, check, status: r.status, source: r.source, detail: r.detail, count: r.count ?? null, windowStart: window.start, windowEnd: window.end },
  });
}

/**
 * Checks each chosen event with Meta, separately, over the last 7 days:
 *   event:<Name>   how many Meta received (Meta's own counts)
 *   params:Purchase whether purchases arrived with a value and a currency
 *   dedup:<Name>   whether browser and server copies both arrive, and whether
 *                  MAIRO can vouch that they share an event ID
 * Each is stored with its source and time. Reading only: nothing is sent to
 * Meta, and no test or made-up event is ever created to pass a check.
 */
export async function verifyMeasurement(organizationId: string): Promise<VerifyResult> {
  const [profile, pixel] = await Promise.all([
    ensureTrackingProfile(organizationId),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } }),
  ]);
  const goals = profile.measurementGoalsSavedAt ? goalsFrom(profile.measurementGoals) : [];
  const events = eventsFor(goals);
  if (events.length === 0) return { ok: false, reason: "no_events", message: "Nothing you chose is a website event, so there's nothing to check with the Pixel." };
  if (!pixel) return { ok: false, reason: "no_pixel", message: "Choose or create a Pixel first." };

  // Counts for every chosen event, in one window (lib/tracking/setup.ts records them).
  const counted = await checkEvents(organizationId, events);
  if (!counted.ok) return { ok: false, reason: counted.reason, message: counted.message };
  const creds = await loadCredentials(organizationId, "META");
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * 864e5);
  const verified = events.filter((e) => counted.data[e]?.status === "VERIFIED");

  if (creds && creds.status === "CONNECTED") {
    if (verified.includes("Purchase")) {
      try {
        const fields = await fetchPixelEventFields(pixel.externalPixelId, creds.accessToken, "Purchase", start);
        const has = fields.has("value") && fields.has("currency");
        await record(
          organizationId,
          pixel.externalPixelId,
          "params:Purchase",
          has
            ? { status: "VERIFIED", source: "meta_params", detail: "Meta's purchase events carry a value and a currency." }
            : { status: "NOT_SEEN", source: "meta_params", detail: `Meta's purchase events are missing ${[!fields.has("value") && "a value", !fields.has("currency") && "a currency"].filter(Boolean).join(" and ")}. Each purchase needs the order total and its currency.` },
          { start, end },
        );
      } catch (e) {
        const c = classifyMetaError(e);
        await record(organizationId, pixel.externalPixelId, "params:Purchase", { status: c.reason === "missing_permission" ? "MISSING_PERMISSION" : "UNAVAILABLE", source: "meta_params", detail: "Meta didn't say which data fields arrived with purchases. Check one in Events Manager → Test events." }, { start, end });
      }
    }
    // Browser and server copies: counted per source, where Meta will say.
    if (verified.length) {
      try {
        const [web, server] = await Promise.all([
          fetchPixelEventCounts(pixel.externalPixelId, creds.accessToken, start, { eventSource: "WEB_ONLY" }),
          fetchPixelEventCounts(pixel.externalPixelId, creds.accessToken, start, { eventSource: "SERVER_ONLY" }),
        ]);
        const viaTag = profile.installRoute === "mairo_tag";
        for (const e of verified) {
          const b = web[e] ?? 0;
          const s = server[e] ?? 0;
          const both = b > 0 && s > 0;
          await record(
            organizationId,
            pixel.externalPixelId,
            `dedup:${e}`,
            !both
              ? { status: "VERIFIED", source: "meta_sources", detail: `Only ${b > 0 ? "browser" : "server"} copies arrive (${b + s}), so there's nothing to merge.` }
              : viaTag
                ? { status: "VERIFIED", source: "meta_sources", detail: `Browser (${b}) and server (${s}) copies both arrive. MAIRO's tag gives each pair the same event name and ID, which is how Meta merges them. Meta's own merge result is in Events Manager → ${e} → Event deduplication.` }
                : { status: "UNAVAILABLE", source: "meta_sources", detail: `Browser (${b}) and server (${s}) copies both arrive from tools MAIRO doesn't control, so MAIRO can't confirm they share event IDs. Check Events Manager → ${e} → Event deduplication.` },
            { start, end },
          );
        }
      } catch {
        for (const e of verified) {
          await record(organizationId, pixel.externalPixelId, `dedup:${e}`, { status: "UNAVAILABLE", source: "meta_sources", detail: "Meta didn't say which copies came from the browser and which from a server. Check Events Manager → Event deduplication." }, { start, end });
        }
      }
    }
  }

  const missing = events.filter((e) => !verified.includes(e));
  return {
    ok: true,
    checked: events,
    verified,
    message: missing.length === 0 ? `Meta is receiving all ${events.length} of the events you chose.` : `Meta is receiving ${verified.length} of ${events.length}. Not yet: ${missing.join(", ")}.`,
  };
}
