"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { checkEvents, checkInstallation, createPixel, listPixelChoices, markInstalled, requiredEventFor, selectPixel, setConsentPolicy, setInstallRoute } from "@/lib/tracking/setup";
import { routeFrom } from "@/lib/tracking/state";
import { recordOrder, rotateIngestToken } from "@/lib/tracking/orders";
import { ensureTrackingProfile } from "@/lib/tracking/profile";
import type { AdPlatform } from "@/generated/prisma/enums";
import { deniedFor } from "@/lib/members/authorize";

// The customer-facing actions for measuring sales.
//
// Tracking is not gated behind a higher plan and that is deliberate. A Starter
// customer advertising on Meta with no pixel is spending money blind, which is
// the thing MAIRO exists to stop — charging more for the ability to know
// whether the ads worked would be selling the problem back to them. What is
// gated is the *network*: TikTok tracking follows TikTok advertising, because
// there is nothing to measure on a network you cannot advertise on.

export type TrackingResult = { ok: true; message: string } | { ok: false; error: string };

async function context() {
  const session = await auth();
  if (!session?.user?.organizationId) return null;
  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;
  return { organizationId, userId: session.user.id ?? "unknown" };
}

/**
 * Whether this business may set up tracking on this network. Meta only — and
 * on every plan, the free one included: tracking costs nothing and has to be
 * right before the first campaign spends, so it belongs to setup.
 */
async function platformAllowed(_organizationId: string, platform: AdPlatform): Promise<boolean> {
  return platform === "META";
}

export type PixelChoiceView = { id: string; name: string; owner: string | null; lastFiredAt: string | null; unavailable: boolean; recommended: boolean; why: string };

/** The pixels already in the business's ad account, best to reuse first. Nothing is chosen here. */
export async function listPixelChoicesAction(): Promise<{ ok: true; choices: PixelChoiceView[] } | { ok: false; reason: string; error: string }> {
  const ctx = await context();
  if (!ctx) return { ok: false, reason: "auth", error: "Not authenticated" };
  if (!(await platformAllowed(ctx.organizationId, "META"))) return { ok: false, reason: "plan", error: "MAIRO sets up tracking for Meta only." };
  const r = await listPixelChoices(ctx.organizationId);
  if (!r.ok) return { ok: false, reason: r.reason, error: r.message };
  return {
    ok: true,
    choices: r.data.choices.map((c) => ({ id: c.id, name: c.name, owner: c.ownerBusiness?.name ?? null, lastFiredAt: c.lastFiredAt?.toISOString() ?? null, unavailable: c.unavailable, recommended: c.recommended, why: c.why })),
  };
}

/** The owner picked this pixel (from the list, or by typing its ID). */
export async function selectPixelAction(pixelId: string): Promise<TrackingResult> {
  // Role check: accounts.manage (lib/members/roles.ts).
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  if (!(await platformAllowed(ctx.organizationId, "META"))) return { ok: false, error: "MAIRO sets up tracking for Meta only." };
  const r = await selectPixel(ctx.organizationId, ctx.userId, pixelId);
  revalidatePath("/dashboard/tracking");
  if (!r.ok) return { ok: false, error: r.message };
  return { ok: true, message: `Using “${r.data.name}” (${r.data.id}). Meta confirmed it.` };
}

/** The owner asked MAIRO to create a pixel in their ad account. */
export async function createPixelAction(): Promise<TrackingResult> {
  // Role check: accounts.manage (lib/members/roles.ts).
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  if (!(await platformAllowed(ctx.organizationId, "META"))) return { ok: false, error: "MAIRO sets up tracking for Meta only." };
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { name: true } });
  const r = await createPixel(ctx.organizationId, ctx.userId, org?.name ?? "My business");
  revalidatePath("/dashboard/tracking");
  if (!r.ok) return { ok: false, error: r.message };
  return { ok: true, message: r.data.reused ? `Found the pixel an earlier attempt created (${r.data.id}) and used it — no duplicate.` : `Created “${r.data.name}” in your ad account. Meta confirmed it: ${r.data.id}.` };
}

/**
 * The simple setup's one button, "Set up my pixel": reuse the pixel the ad
 * account already has (the one rankPixels recommends — reusing keeps its
 * history), or create one when there is none. The button says it does both,
 * so pressing it is the owner's decision either way.
 */
export async function quickSetupPixelAction(): Promise<TrackingResult> {
  // Role check: accounts.manage (lib/members/roles.ts).
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  const existing = await db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId: ctx.organizationId, platform: "META" } } });
  if (existing) return { ok: true, message: `You're set up with “${existing.name}”.` };
  const list = await listPixelChoices(ctx.organizationId);
  if (!list.ok) return { ok: false, error: list.message };
  const best = list.data.choices.find((c) => c.recommended);
  if (best) {
    const r = await selectPixel(ctx.organizationId, ctx.userId, best.id);
    revalidatePath("/dashboard/tracking");
    if (!r.ok) return { ok: false, error: r.message };
    return { ok: true, message: `Using your existing pixel “${r.data.name}”, so it keeps its history.` };
  }
  const org = await db.organization.findUnique({ where: { id: ctx.organizationId }, select: { name: true } });
  const r = await createPixel(ctx.organizationId, ctx.userId, org?.name ?? "My business");
  revalidatePath("/dashboard/tracking");
  if (!r.ok) return { ok: false, error: r.message };
  return { ok: true, message: `Created “${r.data.name}” in your ad account.` };
}

export async function setInstallRouteAction(route: string): Promise<TrackingResult> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  const r = routeFrom(route);
  if (!r) return { ok: false, error: "Unknown installation route." };
  await setInstallRoute(ctx.organizationId, r);
  revalidatePath("/dashboard/tracking");
  return { ok: true, message: "Saved. The steps for that route are below." };
}

export async function markInstalledAction(): Promise<TrackingResult> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  await markInstalled(ctx.organizationId);
  const r = await checkInstallation(ctx.organizationId);
  revalidatePath("/dashboard/tracking");
  if (!r.ok) return { ok: false, error: r.message };
  return { ok: true, message: installMessage(r.data.status) };
}

function installMessage(status: string): string {
  switch (status) {
    case "VERIFIED":
      return "Installation detected.";
    case "NOT_DETECTED":
      return "Not detected yet — see the detail below. Nothing is broken; it just isn't on the pages MAIRO can read.";
    case "MISSING_PERMISSION":
      return "Your Meta connection can't read this pixel. Reconnect Meta and grant access.";
    default:
      return "The check didn't finish. Try again in a minute.";
  }
}

export async function checkInstallationAction(): Promise<TrackingResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  const r = await checkInstallation(ctx.organizationId);
  revalidatePath("/dashboard/tracking");
  if (!r.ok) return { ok: false, error: r.message };
  return { ok: true, message: installMessage(r.data.status) };
}

export async function checkEventsAction(): Promise<TrackingResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  const profile = await ensureTrackingProfile(ctx.organizationId);
  const required = requiredEventFor(profile.nicheId);
  const events = [...new Set([required ?? "Lead", "PageView"])];
  const r = await checkEvents(ctx.organizationId, events);
  revalidatePath("/dashboard/tracking");
  if (!r.ok) return { ok: false, error: r.message };
  const main = r.data[required ?? "Lead"];
  return { ok: true, message: main?.detail ?? "Checked." };
}

export async function setConsentPolicyAction(policy: string): Promise<TrackingResult> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  if (policy !== "respect_denied" && policy !== "require_granted") return { ok: false, error: "Unknown setting." };
  await setConsentPolicy(ctx.organizationId, policy);
  revalidatePath("/dashboard/tracking");
  return { ok: true, message: "Saved. It applies to the next order MAIRO receives." };
}

export async function rotateIngestTokenAction(): Promise<TrackingResult> {
  // Role check: accounts.manage (lib/members/roles.ts).
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  await rotateIngestToken(ctx.organizationId);
  revalidatePath("/dashboard/tracking");
  return {
    ok: true,
    message: "New link created. Update it in your shop — the old one has stopped working.",
  };
}

export async function saveShopifySecretAction(secret: string): Promise<TrackingResult> {
  // Role check: accounts.manage (lib/members/roles.ts).
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const value = secret.trim();
  if (value.length === 0) {
    await db.storeIngest.update({
      where: { organizationId: ctx.organizationId },
      data: { shopifySecret: null },
    });
    revalidatePath("/dashboard/tracking");
    return { ok: true, message: "Signature checking turned off." };
  }

  if (value.length < 16) return { ok: false, error: "That doesn't look like a Shopify secret." };

  await db.storeIngest.update({
    where: { organizationId: ctx.organizationId },
    // Encrypted with the same box as every other stored secret. It is a
    // signing key: anyone holding it can forge orders into this account.
    data: { shopifySecret: encryptSecret(value) },
  });
  revalidatePath("/dashboard/tracking");
  return { ok: true, message: "Saved. MAIRO now checks Shopify's signature on every order." };
}

/**
 * Records a sale the customer took off the internet.
 *
 * For the businesses MAIRO is mostly for — a plumber, a gym, a bakery — the
 * order does not happen on a website at all, so there is nothing for a pixel
 * to see. Typing it in is how they still get a real ROAS, and Meta and TikTok
 * both take these the same way as any other conversion.
 */
export async function recordManualOrderAction(input: {
  orderId: string;
  value: string;
  currency: string;
  email?: string | null;
  occurredAt?: string | null;
}): Promise<TrackingResult> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const orderId = input.orderId.trim();
  if (orderId.length === 0) return { ok: false, error: "Give the order a reference." };

  const amount = Number(input.value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter what the order was worth, as a number." };
  }

  const when = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (!Number.isFinite(when.getTime())) return { ok: false, error: "That date didn't make sense." };
  if (when.getTime() > Date.now() + 60_000) {
    return { ok: false, error: "That order is in the future." };
  }

  try {
    const result = await recordOrder(ctx.organizationId, "MANUAL", {
      externalOrderId: orderId,
      valueCents: Math.round(amount * 100),
      currency: input.currency || "USD",
      occurredAt: when,
      email: input.email ?? null,
    });
    revalidatePath("/dashboard/tracking");

    if (!result.created) {
      return { ok: false, error: "An order with that reference is already recorded." };
    }
    const sent = result.forwarded.filter((f) => f.status === "SENT").length;
    return {
      ok: true,
      message:
        sent > 0
          ? `Recorded, and sent to ${sent === 1 ? "1 network" : `${sent} networks`}.`
          : "Recorded. It'll go to the networks once a pixel is set up.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Couldn't record that order.",
    };
  }
}

// --- Google Tag Manager -----------------------------------------------------

export async function setNicheAction(nicheId: string): Promise<TrackingResult> {
  // Role check: business.edit (lib/members/roles.ts).
  const denied = await deniedFor("business.edit");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { nicheById } = await import("@/lib/tracking/niches");
  const niche = nicheById(nicheId);

  await ensureTrackingProfile(ctx.organizationId);
  await db.trackingProfile.update({
    where: { organizationId: ctx.organizationId },
    // Confirmed, because they chose it. Even choosing the same value MAIRO
    // guessed is information: it means somebody looked and agreed.
    data: { nicheId: niche.id, nicheConfirmed: true },
  });

  revalidatePath("/dashboard/tracking");
  return { ok: true, message: `Tracking the conversions that matter for a ${niche.label.toLowerCase()}.` };
}

export async function setGtmContainerAction(containerId: string): Promise<TrackingResult> {
  // Role check: accounts.manage (lib/members/roles.ts).
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const value = containerId.trim().toUpperCase();
  await ensureTrackingProfile(ctx.organizationId);

  if (value.length === 0) {
    await db.trackingProfile.update({
      where: { organizationId: ctx.organizationId },
      data: { gtmContainerId: null },
    });
    revalidatePath("/dashboard/tracking");
    return { ok: true, message: "Container removed." };
  }

  const { isGtmContainerId } = await import("@/lib/tracking/gtm");
  if (!isGtmContainerId(value)) {
    return { ok: false, error: "That should look like GTM-ABC1234 — you'll find it at the top of your Tag Manager screen." };
  }

  await db.trackingProfile.update({
    where: { organizationId: ctx.organizationId },
    data: { gtmContainerId: value },
  });

  revalidatePath("/dashboard/tracking");
  return { ok: true, message: `Saved ${value}.` };
}

// --- Tag Manager provisioning (Google API) ----------------------------------

export type ContainerChoice = {
  accountId: string;
  accountName: string;
  containerId: string;
  publicId: string;
  name: string;
};

/**
 * Every web container this Google account can reach, so the customer picks one.
 *
 * Deliberately not auto-selected even when there is exactly one. Publishing
 * writes to a live website, and "MAIRO picked the only container it could see"
 * is not consent — a person who administers one container today may administer
 * their client's tomorrow.
 */
export async function listGtmContainersAction(): Promise<
  { ok: true; containers: ContainerChoice[] } | { ok: false; error: string }
> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { loadGtmCredentials } = await import("@/lib/tracking/gtm-connection");
  const creds = await loadGtmCredentials(ctx.organizationId);
  if (!creds) return { ok: false, error: "Connect Tag Manager first." };

  const { listAccounts, listContainers, explainGtmApiError } = await import(
    "@/lib/tracking/gtm-api/client"
  );

  try {
    const accounts = await listAccounts(creds.accessToken);
    const out: ContainerChoice[] = [];
    for (const account of accounts) {
      const containers = await listContainers(creds.accessToken, account.accountId);
      for (const c of containers) {
        out.push({
          accountId: account.accountId,
          accountName: account.name,
          containerId: c.containerId,
          publicId: c.publicId,
          name: c.name,
        });
      }
    }
    return { ok: true, containers: out };
  } catch (error) {
    return { ok: false, error: explainGtmApiError(error) };
  }
}

export async function chooseGtmContainerAction(
  choice: ContainerChoice
): Promise<TrackingResult> {
  // Role check: accounts.manage (lib/members/roles.ts).
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { loadGtmCredentials, setGtmContainer } = await import("@/lib/tracking/gtm-connection");
  const creds = await loadGtmCredentials(ctx.organizationId);
  if (!creds) return { ok: false, error: "Connect Tag Manager first." };

  // The choice comes from the browser, so it is checked against what this
  // token can actually reach rather than trusted — otherwise a crafted request
  // could point MAIRO at a container id belonging to someone else.
  const { listContainers } = await import("@/lib/tracking/gtm-api/client");
  const reachable = await listContainers(creds.accessToken, choice.accountId).catch(() => []);
  const match = reachable.find((c) => c.containerId === choice.containerId);
  if (!match) {
    return { ok: false, error: "That container isn't one this Google account can edit." };
  }

  await setGtmContainer(ctx.organizationId, {
    accountId: choice.accountId,
    containerId: match.containerId,
    publicId: match.publicId,
    name: match.name,
  });

  // Also record it on the tracking profile, so the page can show the install
  // snippet whether the customer connected Google or typed the id by hand.
  await ensureTrackingProfile(ctx.organizationId);
  await db.trackingProfile.update({
    where: { organizationId: ctx.organizationId },
    data: { gtmContainerId: match.publicId },
  });

  revalidatePath("/dashboard/tracking");
  return { ok: true, message: `Using ${match.publicId} — ${match.name}.` };
}

/**
 * Builds and publishes the tags into the customer's container.
 *
 * The one action in the product that changes something on a website MAIRO does
 * not own, so it is never automatic: it happens when somebody presses the
 * button, and it says exactly what it did.
 */
export async function provisionGtmAction(): Promise<TrackingResult> {
  // Role check: accounts.manage (lib/members/roles.ts).
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { provisionContainer } = await import("@/lib/tracking/gtm-api/provision");
  const result = await provisionContainer(ctx.organizationId);

  revalidatePath("/dashboard/tracking");
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, message: result.data.message };
}

export async function disconnectGtmAction(): Promise<TrackingResult> {
  // Role check: accounts.manage (lib/members/roles.ts).
  const denied = await deniedFor("accounts.manage");
  if (denied) return { ok: false, error: denied };
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  const { disconnectGtm } = await import("@/lib/tracking/gtm-connection");
  await disconnectGtm(ctx.organizationId);

  revalidatePath("/dashboard/tracking");
  return { ok: true, message: "Disconnected. Tags MAIRO already published stay live in your container." };
}
