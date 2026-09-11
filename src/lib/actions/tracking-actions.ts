"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeOrganizationId } from "@/lib/active-org";
import { entitlementsFor } from "@/lib/entitlements";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { adoptPixel, ensurePixel, refreshPixelStatus } from "@/lib/tracking/pixels";
import { recordOrder, rotateIngestToken } from "@/lib/tracking/orders";
import type { AdPlatform } from "@/generated/prisma/enums";

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
  return { organizationId };
}

/** Whether this business may track on this network at all. */
async function platformAllowed(organizationId: string, platform: AdPlatform): Promise<boolean> {
  const ent = await entitlementsFor(organizationId);
  if (platform === "TIKTOK") return ent.tiktok_ads;
  if (platform === "META") return ent.meta_ads;
  return false;
}

export async function setUpPixelAction(platform: AdPlatform): Promise<TrackingResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  if (!(await platformAllowed(ctx.organizationId, platform))) {
    return {
      ok: false,
      error:
        platform === "TIKTOK"
          ? "TikTok is part of Growth. Starter covers Meta — you can track Meta sales on it."
          : "That network isn't on your plan.",
    };
  }

  const org = await db.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { name: true },
  });

  const result = await ensurePixel(ctx.organizationId, platform, org?.name ?? "MAIRO");
  revalidatePath("/dashboard/tracking");

  if (!result.ok) return { ok: false, error: result.error.message };
  return {
    ok: true,
    message:
      result.data.status === "ACTIVE"
        ? "Found a pixel already receiving events on your account — MAIRO will use that one."
        : "Pixel ready. Put the code below on your website and it starts measuring.",
  };
}

export async function adoptPixelAction(
  platform: AdPlatform,
  pixelId: string
): Promise<TrackingResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };
  if (!(await platformAllowed(ctx.organizationId, platform))) {
    return { ok: false, error: "That network isn't on your plan." };
  }

  const result = await adoptPixel(ctx.organizationId, platform, pixelId);
  revalidatePath("/dashboard/tracking");

  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, message: `Using pixel ${result.data.pixelId}.` };
}

/**
 * Asks the network whether the pixel has seen anything yet.
 *
 * Its own action rather than something the page does on load, because it is a
 * network round trip per platform and the answer changes on the scale of
 * minutes — someone who has just pasted the code wants to press a button and
 * find out, and everyone else should not pay for that call on every visit.
 */
export async function checkPixelAction(platform: AdPlatform): Promise<TrackingResult> {
  const ctx = await context();
  if (!ctx) return { ok: false, error: "Not authenticated" };

  await refreshPixelStatus(ctx.organizationId, platform);

  const row = await db.trackingPixel.findUnique({
    where: { organizationId_platform: { organizationId: ctx.organizationId, platform } },
  });
  revalidatePath("/dashboard/tracking");

  if (!row) return { ok: false, error: "No pixel set up on that network yet." };
  if (row.lastError) return { ok: false, error: row.lastError };

  return {
    ok: true,
    message:
      row.status === "ACTIVE"
        ? `Working — last event ${row.lastFiredAt?.toLocaleString() ?? "just now"}.`
        : "Nothing has reached it yet. If you've only just added the code, visit your own site and check again in a minute.",
  };
}

export async function rotateIngestTokenAction(): Promise<TrackingResult> {
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
