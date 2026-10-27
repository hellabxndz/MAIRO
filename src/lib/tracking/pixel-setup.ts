import { db } from "@/lib/db";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import { metaGraphRequest } from "@/lib/meta/client";
import { ensureTrackingProfile } from "@/lib/tracking/profile";
import { classifyMetaError, createPixel, listPixelChoices, selectPixel, type PixelChoice, type SetupResult } from "@/lib/tracking/setup";
import { fetchMetaPixel, listMetaPixels } from "@/lib/tracking/meta-pixel";
import { pixelStatusFrom } from "@/lib/tracking/pixels";
import {
  businessPixelNeed,
  campaignPixelNeed,
  launchGate,
  leadMeasurementFrom,
  pixelDecisionFrom,
  pixelStatus,
  type LaunchGate,
  type LeadMeasurement,
  type PixelDecision,
  type PixelState,
  type PixelStatus,
} from "@/lib/tracking/pixel-rules";

// Choosing (or declining) the Meta Pixel, for one business: what the setup
// page, the onboarding step, settings and the launch gate read and write.
// Every read and write is scoped to one organization; access tokens stay on
// the server and are never logged or returned.
//
// Three things are kept apart throughout:
//   chosen in MAIRO      a pixel the connected Meta account can use, picked by the owner
//   receiving events     Meta's own last_fired_time, or MAIRO finding the code on the site
//   verified purchases   Meta's event stats show Purchase events
// Choosing or creating a pixel never counts as the second or third.

const err = <T,>(reason: "not_connected" | "missing_permission" | "in_progress" | "not_found" | "failed", message: string): SetupResult<T> => ({ ok: false, reason, message });

/** The pixel facts the rules need, read from this business's records. */
export async function pixelStateFor(organizationId: string): Promise<PixelState & { leadMeasurement: LeadMeasurement | null }> {
  const [profile, pixel, meta] = await Promise.all([
    ensureTrackingProfile(organizationId),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { metaAdAccountId: true } }),
  ]);
  const checks = pixel
    ? await db.trackingVerification.findMany({
        where: { organizationId, pixelId: pixel.externalPixelId, check: { in: ["install", "event:Purchase"] } },
        orderBy: { checkedAt: "desc" },
        take: 10,
      })
    : [];
  const latest = (check: string) => checks.find((c) => c.check === check) ?? null;
  return {
    decision: pixelDecisionFrom(profile.pixelDecision) ?? (pixel ? "use" : null),
    leadMeasurement: leadMeasurementFrom(profile.leadMeasurement),
    pixel: pixel
      ? {
          id: pixel.externalPixelId,
          name: pixel.name,
          lastFiredAt: pixel.lastFiredAt,
          installDetected: latest("install")?.status === "VERIFIED",
          accessLost: Boolean(pixel.accessLostAt),
          otherAdAccount: Boolean(pixel.metaAdAccountId && meta?.metaAdAccountId && pixel.metaAdAccountId !== meta.metaAdAccountId),
        }
      : null,
    purchaseVerified: latest("event:Purchase")?.status === "VERIFIED",
  };
}

/** Whether one campaign may launch, from its objective and destination and the business's Pixel. */
export async function campaignLaunchGate(organizationId: string, campaign: { objective: string; destinationType: string }): Promise<LaunchGate> {
  const profile = await ensureTrackingProfile(organizationId);
  const { need } = campaignPixelNeed({ nicheId: profile.nicheId, objective: campaign.objective, destination: campaign.destinationType });
  if (need !== "required_for_purchases") return { ok: true };
  return launchGate(need, await pixelStateFor(organizationId));
}

/** By id, for the launch paths. A campaign that isn't this business's is never "ok". */
export async function launchGateForCampaign(organizationId: string, mairoCampaignId: string): Promise<LaunchGate> {
  const c = await db.mairoCampaign.findFirst({ where: { id: mairoCampaignId, organizationId }, select: { objective: true, destinationType: true } });
  if (!c) return { ok: false, code: "no_pixel", title: "Campaign not found", reason: "That campaign isn't one of this business's.", fixes: [] };
  return campaignLaunchGate(organizationId, c);
}

export type PixelSetupView = {
  connected: boolean;
  adAccountId: string | null;
  need: "required_for_purchases" | "optional";
  nicheId: string;
  website: string | null;
  decision: PixelDecision;
  leadMeasurement: LeadMeasurement | null;
  status: PixelStatus;
  pixel: {
    id: string;
    name: string;
    origin: string;
    ownerBusinessName: string | null;
    adAccountId: string | null;
    websiteDomain: string | null;
    selectedAt: string | null;
    lastFiredAt: string | null;
    lastCheckedAt: string | null;
    accessLostAt: string | null;
  } | null;
  install: { status: string; detail: string | null; checkedAt: string } | null;
  purchase: { status: string; detail: string | null; checkedAt: string; count: number | null } | null;
};

/** Everything the setup page and settings show. Database only — no call to Meta. */
export async function loadPixelSetup(organizationId: string): Promise<PixelSetupView> {
  const [org, intake, profile, meta, pixel, state] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { website: true } }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { primaryGoal: true } }),
    ensureTrackingProfile(organizationId),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true, metaAdAccountId: true } }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } }),
    pixelStateFor(organizationId),
  ]);
  const checks = pixel
    ? await db.trackingVerification.findMany({ where: { organizationId, pixelId: pixel.externalPixelId, check: { in: ["install", "event:Purchase"] } }, orderBy: { checkedAt: "desc" }, take: 10 })
    : [];
  const latest = (check: string) => checks.find((c) => c.check === check) ?? null;
  const install = latest("install");
  const purchase = latest("event:Purchase");
  return {
    connected: meta?.status === "CONNECTED",
    adAccountId: meta?.metaAdAccountId ?? null,
    need: businessPixelNeed({ nicheId: profile.nicheId, goal: intake?.primaryGoal ?? null }),
    nicheId: profile.nicheId,
    website: org?.website ?? null,
    decision: state.decision,
    leadMeasurement: state.leadMeasurement,
    status: pixelStatus(state),
    pixel: pixel
      ? {
          id: pixel.externalPixelId,
          name: pixel.name,
          origin: pixel.origin,
          ownerBusinessName: pixel.ownerBusinessName,
          adAccountId: pixel.metaAdAccountId,
          websiteDomain: pixel.websiteDomain,
          selectedAt: pixel.selectedAt?.toISOString() ?? null,
          lastFiredAt: pixel.lastFiredAt?.toISOString() ?? null,
          lastCheckedAt: pixel.lastCheckedAt?.toISOString() ?? null,
          accessLostAt: pixel.accessLostAt?.toISOString() ?? null,
        }
      : null,
    install: install ? { status: install.status, detail: install.detail, checkedAt: install.checkedAt.toISOString() } : null,
    purchase: purchase ? { status: purchase.status, detail: purchase.detail, checkedAt: purchase.checkedAt.toISOString(), count: purchase.count } : null,
  };
}

/** The host of a website address, lowercased, without www. Null for anything that isn't one. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

async function grantedPermissions(accessToken: string): Promise<Set<string> | null> {
  try {
    const res = await metaGraphRequest<{ data?: { permission: string; status: string }[] }>("/me/permissions", { accessToken });
    return new Set((res.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission));
  } catch {
    return null;
  }
}

/** Websites Meta has seen this pixel's events from (pixel stats by host). Empty when Meta won't say. */
async function pixelHosts(pixelId: string, accessToken: string): Promise<string[]> {
  try {
    const since = Math.floor((Date.now() - 28 * 864e5) / 1000);
    const res = await metaGraphRequest<{ data?: { data?: { value?: string; count?: number }[] }[] }>(`/${pixelId}/stats`, {
      accessToken,
      params: { aggregation: "host", start_time: since },
    });
    const hosts = new Set<string>();
    for (const b of res.data ?? []) for (const r of b.data ?? []) if (r.value) hosts.add(r.value.toLowerCase().replace(/^www\./, ""));
    return [...hosts].slice(0, 5);
  } catch {
    return [];
  }
}

export type AccessiblePixels = {
  adAccountId: string;
  choices: (PixelChoice & { hosts: string[] })[];
  /** Creating through the API is possible: the connection has ads_management. Meta may still refuse for its own reasons. */
  canCreate: boolean;
  /** When it isn't, which permission is missing. */
  missingForCreate: string[];
  /** Permissions couldn't be read; creating is offered and Meta's answer decides. */
  permissionsUnknown: boolean;
};

/** The pixels this business's connected Meta account can use in its ad account, with what's needed to create one. */
export async function accessiblePixels(organizationId: string): Promise<SetupResult<AccessiblePixels>> {
  const creds = await loadCredentials(organizationId, "META");
  if (!creds || creds.status !== "CONNECTED") return err("not_connected", "Connect Meta first — pixels live in your Meta ad account.");
  const list = await listPixelChoices(organizationId);
  if (!list.ok) return list;
  const [granted, hosts] = await Promise.all([
    grantedPermissions(creds.accessToken),
    Promise.all(list.data.choices.filter((c) => !c.unavailable).slice(0, 10).map(async (c) => [c.id, await pixelHosts(c.id, creds.accessToken)] as const)),
  ]);
  const hostMap = new Map(hosts);
  const missingForCreate = granted ? ["ads_management"].filter((p) => !granted.has(p)) : [];
  return {
    ok: true,
    data: {
      adAccountId: list.data.adAccountId,
      choices: list.data.choices.map((c) => ({ ...c, hosts: hostMap.get(c.id) ?? [] })),
      canCreate: missingForCreate.length === 0,
      missingForCreate,
      permissionsUnknown: granted === null,
    },
  };
}

async function recordDecision(organizationId: string, userId: string, decision: "use" | "declined", leadMeasurement?: LeadMeasurement | null) {
  await ensureTrackingProfile(organizationId);
  await db.trackingProfile.update({
    where: { organizationId },
    data: {
      pixelDecision: decision,
      pixelDecidedAt: new Date(),
      pixelDecidedById: userId,
      ...(leadMeasurement !== undefined ? { leadMeasurement } : {}),
    },
  });
}

/**
 * Uses a pixel the owner picked, once Meta confirms it: it must be one the
 * connected account can read AND one shared with this business's ad account
 * (not just any pixel the person's login can see). The website it's for is
 * the owner's confirmation, saved with it.
 */
export async function choosePixel(
  organizationId: string,
  userId: string,
  input: { pixelId: string; websiteDomain: string | null },
): Promise<SetupResult<{ id: string; name: string; already: boolean }>> {
  const id = input.pixelId.trim();
  if (!/^\d{6,30}$/.test(id)) return err("not_found", "That doesn't look like a Meta Pixel ID — it's a long number.");
  const creds = await loadCredentials(organizationId, "META");
  if (!creds || creds.status !== "CONNECTED") return err("not_connected", "Connect Meta first.");

  const current = await db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } });
  let inAccount: boolean;
  try {
    inAccount = (await listMetaPixels(creds.externalAccountId, creds.accessToken)).some((p) => p.id === id);
  } catch (e) {
    const c = classifyMetaError(e);
    return { ok: false, ...c };
  }
  if (!inAccount) {
    return err("not_found", `That Pixel isn't shared with your ad account ${creds.externalAccountId}. Choose one from the list, or share it with this ad account in Meta Business Settings → Data sources → Datasets, then refresh.`);
  }

  const already = current?.externalPixelId === id;
  if (!already) {
    const r = await selectPixel(organizationId, userId, id);
    if (!r.ok) return r;
  }
  const domain = input.websiteDomain ? hostOf(input.websiteDomain) : null;
  const row = await db.trackingPixel.update({
    where: { organizationId_platform: { organizationId, platform: "META" } },
    data: {
      metaAdAccountId: creds.externalAccountId,
      accessLostAt: null,
      ...(domain ? { websiteDomain: domain, websiteConfirmedAt: new Date() } : {}),
    },
  });
  await recordDecision(organizationId, userId, "use");
  return { ok: true, data: { id: row.externalPixelId, name: row.name, already } };
}

/**
 * Creates a pixel in the business's ad account — only when the connection
 * has the permission to, and only reported once Meta returned an id and
 * confirmed it on a fresh read (createPixel). When MAIRO can't create one,
 * the answer says so and the page shows how to create it in Events Manager.
 */
export async function createPixelForBusiness(organizationId: string, userId: string, websiteDomain: string | null): Promise<SetupResult<{ id: string; name: string; reused: boolean }>> {
  const creds = await loadCredentials(organizationId, "META");
  if (!creds || creds.status !== "CONNECTED") return err("not_connected", "Connect Meta first — the Pixel is created in your ad account.");
  const granted = await grantedPermissions(creds.accessToken);
  if (granted && !granted.has("ads_management")) {
    return err("missing_permission", "Your Meta connection doesn't include permission to manage ads (ads_management), which creating a Pixel needs. Create it in Meta Events Manager instead — the steps are below — or reconnect Meta and allow it.");
  }
  const existing = await db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { externalPixelId: true } });
  if (existing) return err("failed", "You already have a Pixel chosen. To use a different one, choose it from the list — MAIRO won't create a second Pixel alongside it.");
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  const r = await createPixel(organizationId, userId, org?.name ?? "My business");
  if (!r.ok) {
    return r.reason === "failed" || r.reason === "missing_permission"
      ? { ...r, message: `${r.message} You can create it in Meta Events Manager instead — the steps are below — then refresh the list and choose it.` }
      : r;
  }
  const domain = hostOf(websiteDomain);
  await db.trackingPixel.update({
    where: { organizationId_platform: { organizationId, platform: "META" } },
    data: { metaAdAccountId: creds.externalAccountId, accessLostAt: null, ...(domain ? { websiteDomain: domain, websiteConfirmedAt: new Date() } : {}) },
  });
  await recordDecision(organizationId, userId, "use");
  return r;
}

/**
 * "I don't want to connect a Pixel." Recorded, with how leads are measured
 * instead when the owner says. A pixel already chosen stops being used by
 * MAIRO (it stays in their Meta account, untouched).
 */
export async function declinePixel(organizationId: string, userId: string, leadMeasurement: LeadMeasurement | null): Promise<{ ok: true }> {
  await db.trackingPixel.deleteMany({ where: { organizationId, platform: "META" } });
  await recordDecision(organizationId, userId, "declined", leadMeasurement);
  return { ok: true };
}

/** How leads are measured, without touching the Pixel choice. */
export async function setLeadMeasurement(organizationId: string, leadMeasurement: LeadMeasurement | null): Promise<void> {
  await ensureTrackingProfile(organizationId);
  await db.trackingProfile.update({ where: { organizationId }, data: { leadMeasurement } });
}

/**
 * Re-checks that the connected Meta account can still use the chosen pixel,
 * and refreshes when Meta last received an event from it. Revoked access is
 * recorded (accessLostAt) so the launch gate and every screen say so.
 */
export async function recheckPixelAccess(organizationId: string): Promise<SetupResult<{ accessible: boolean; lastFiredAt: Date | null; message: string }>> {
  const pixel = await db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } } });
  if (!pixel) return err("not_found", "No Pixel is chosen yet.");
  const creds = await loadCredentials(organizationId, "META");
  if (!creds || creds.status !== "CONNECTED") {
    await db.trackingPixel.update({ where: { id: pixel.id }, data: { accessLostAt: new Date(), lastCheckedAt: new Date(), lastError: "Meta isn't connected." } });
    return err("not_connected", "Your Meta connection has ended. Reconnect Meta, then re-check.");
  }
  try {
    const [node, inAccount] = await Promise.all([
      fetchMetaPixel(pixel.externalPixelId, creds.accessToken),
      listMetaPixels(creds.externalAccountId, creds.accessToken).then((l) => l.some((p) => p.id === pixel.externalPixelId)),
    ]);
    if (!node?.id || node.id !== pixel.externalPixelId || !inAccount) {
      await db.trackingPixel.update({ where: { id: pixel.id }, data: { accessLostAt: new Date(), lastCheckedAt: new Date(), lastError: "Not shared with the connected ad account." } });
      return { ok: true, data: { accessible: false, lastFiredAt: pixel.lastFiredAt, message: `This Pixel isn't shared with your ad account ${creds.externalAccountId} any more. Share it again in Meta Business Settings, or choose another.` } };
    }
    await db.trackingPixel.update({
      where: { id: pixel.id },
      data: { accessLostAt: null, lastCheckedAt: new Date(), lastError: null, lastFiredAt: node.lastFiredAt, status: pixelStatusFrom(node.lastFiredAt), metaAdAccountId: creds.externalAccountId },
    });
    return {
      ok: true,
      data: {
        accessible: true,
        lastFiredAt: node.lastFiredAt,
        message: node.lastFiredAt
          ? `MAIRO can use this Pixel. Meta last received an event from it on ${node.lastFiredAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`
          : "MAIRO can use this Pixel. Meta hasn't received any events from it yet — it isn't installed on your website, or nobody has visited since.",
      },
    };
  } catch (e) {
    const c = classifyMetaError(e);
    if (c.reason === "missing_permission" || c.reason === "not_connected") {
      await db.trackingPixel.update({ where: { id: pixel.id }, data: { accessLostAt: new Date(), lastCheckedAt: new Date(), lastError: c.message } });
    }
    return { ok: false, ...c };
  }
}
