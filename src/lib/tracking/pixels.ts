import { db } from "@/lib/db";
import type { AdPlatform, PixelStatus } from "@/generated/prisma/enums";
import { fail, ok, type PlatformResult } from "@/lib/ad-platforms/types";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import {
  createMetaPixel,
  fetchMetaPixel,
  listMetaPixels,
  metaPixelSnippet,
  metaPurchaseSnippet,
} from "@/lib/tracking/meta-pixel";
import {
  createTikTokPixel,
  fetchTikTokPixel,
  listTikTokPixels,
  tiktokPixelSnippet,
  tiktokPurchaseSnippet,
} from "@/lib/tracking/tiktok-pixel";

// Getting a business tracking their sales, on whichever networks they use.
//
// The thing this module is careful about is the difference between a pixel
// existing and a pixel working. Creating one is an API call that always
// succeeds; installing it is a person pasting code into a website, and that
// is where it goes wrong — pasted into a theme that gets replaced, blocked by
// a consent banner, or put on a page nobody reaches. A dashboard that shows a
// green tick for "pixel created" and an empty ROAS column for the next three
// months is worse than one that never mentioned tracking.
//
// So status is never inferred from MAIRO's own records. It is read back from
// the network — when did you last see an event from this thing — and a pixel
// that has never fired says exactly that.

/** How long without an event before a pixel is treated as not working. */
const STALE_AFTER_HOURS = 48;

export type PixelSnapshot = {
  platform: AdPlatform;
  pixelId: string;
  name: string;
  status: PixelStatus;
  lastFiredAt: Date | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  /** The base code for the site. */
  baseSnippet: string;
  /** The bit that goes on the order-confirmation page. */
  purchaseSnippet: string;
};

function statusFrom(lastFiredAt: Date | null): PixelStatus {
  if (!lastFiredAt) return "NO_EVENTS";
  const ageHours = (Date.now() - lastFiredAt.getTime()) / 36e5;
  return ageHours <= STALE_AFTER_HOURS ? "ACTIVE" : "NO_EVENTS";
}

function snippetsFor(platform: AdPlatform, pixelId: string) {
  if (platform === "TIKTOK") {
    return { baseSnippet: tiktokPixelSnippet(pixelId), purchaseSnippet: tiktokPurchaseSnippet() };
  }
  return { baseSnippet: metaPixelSnippet(pixelId), purchaseSnippet: metaPurchaseSnippet() };
}

/**
 * Makes sure the business has a pixel on this network, and returns it.
 *
 * Adopts an existing pixel in preference to making a new one. A business that
 * has advertised before very often has a pixel with months of history on it,
 * and creating a second would split that history: the old pixel keeps the
 * audience and the learning, the new one starts from nothing, and the customer
 * sees performance fall off a cliff for reasons nobody can explain.
 */
export async function ensurePixel(
  organizationId: string,
  platform: AdPlatform,
  businessName: string
): Promise<PlatformResult<PixelSnapshot>> {
  const existing = await db.trackingPixel.findUnique({
    where: { organizationId_platform: { organizationId, platform } },
  });
  if (existing) return ok(toSnapshot(existing));

  const creds = await loadCredentials(organizationId, platform);
  if (!creds || creds.status !== "CONNECTED") {
    return fail(
      "not_connected",
      `Connect ${platform === "TIKTOK" ? "TikTok" : "Meta"} first — the pixel is created on your advertising account.`
    );
  }

  const name = `${businessName} — MAIRO`.slice(0, 50);

  try {
    const found = await listExisting(platform, creds.externalAccountId, creds.accessToken);
    const adopted = found[0] ?? null;

    const pixel =
      adopted ??
      (platform === "TIKTOK"
        ? await createTikTokPixel(creds.externalAccountId, creds.accessToken, name)
        : await createMetaPixel(creds.externalAccountId, creds.accessToken, name));

    const row = await db.trackingPixel.create({
      data: {
        organizationId,
        platform,
        externalPixelId: pixel.id,
        name: pixel.name,
        origin: adopted ? "EXISTING" : "CREATED_BY_MAIRO",
        status: statusFrom(pixel.lastFiredAt),
        lastFiredAt: pixel.lastFiredAt,
        lastCheckedAt: new Date(),
      },
    });

    return ok(toSnapshot(row));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't set up the pixel.";
    return fail("rejected", message, error);
  }
}

async function listExisting(platform: AdPlatform, accountId: string, token: string) {
  return platform === "TIKTOK"
    ? listTikTokPixels(accountId, token)
    : listMetaPixels(accountId, token);
}

type PixelRow = {
  platform: AdPlatform;
  externalPixelId: string;
  name: string;
  status: PixelStatus;
  lastFiredAt: Date | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
};

function toSnapshot(row: PixelRow): PixelSnapshot {
  return {
    platform: row.platform,
    pixelId: row.externalPixelId,
    name: row.name,
    status: row.status,
    lastFiredAt: row.lastFiredAt,
    lastCheckedAt: row.lastCheckedAt,
    lastError: row.lastError,
    ...snippetsFor(row.platform, row.externalPixelId),
  };
}

/**
 * Asks the network whether the pixel is actually receiving anything.
 *
 * The one function that can tell a customer their tracking is broken. An
 * unreachable network leaves the last known state alone and records the error
 * rather than reporting NO_EVENTS — "we couldn't check" and "it isn't working"
 * are different answers, and only one of them should make somebody go and
 * re-paste code into their website.
 */
export async function refreshPixelStatus(
  organizationId: string,
  platform: AdPlatform
): Promise<void> {
  const row = await db.trackingPixel.findUnique({
    where: { organizationId_platform: { organizationId, platform } },
  });
  if (!row) return;

  const creds = await loadCredentials(organizationId, platform);
  if (!creds || creds.status !== "CONNECTED") return;

  try {
    const pixel =
      platform === "TIKTOK"
        ? await fetchTikTokPixel(creds.externalAccountId, creds.accessToken, row.externalPixelId)
        : await fetchMetaPixel(row.externalPixelId, creds.accessToken);

    if (!pixel) {
      await db.trackingPixel.update({
        where: { id: row.id },
        data: {
          status: "ERROR",
          lastCheckedAt: new Date(),
          lastError: "This pixel is no longer on your advertising account.",
        },
      });
      return;
    }

    await db.trackingPixel.update({
      where: { id: row.id },
      data: {
        name: pixel.name || row.name,
        status: statusFrom(pixel.lastFiredAt),
        // Never moved backwards: a network that forgets a timestamp it gave us
        // once should not erase the proof that the pixel has ever worked.
        lastFiredAt: pixel.lastFiredAt ?? row.lastFiredAt,
        lastCheckedAt: new Date(),
        lastError: null,
      },
    });
  } catch (error) {
    await db.trackingPixel.update({
      where: { id: row.id },
      data: {
        lastCheckedAt: new Date(),
        lastError: error instanceof Error ? error.message : "Couldn't reach the network.",
      },
    });
  }
}

/** Every pixel this business has, with its snippets. */
export async function pixelsFor(organizationId: string): Promise<PixelSnapshot[]> {
  const rows = await db.trackingPixel.findMany({
    where: { organizationId },
    orderBy: { platform: "asc" },
  });
  return rows.map(toSnapshot);
}

/**
 * Adopts a pixel the customer already has, by id.
 *
 * The escape hatch for a business whose pixel lives on a Business Manager
 * MAIRO's token cannot list — which is common enough that refusing would send
 * them to support. The id is verified against the network before it is saved,
 * so a typo fails here rather than silently tracking nothing.
 */
export async function adoptPixel(
  organizationId: string,
  platform: AdPlatform,
  pixelId: string
): Promise<PlatformResult<PixelSnapshot>> {
  const trimmed = pixelId.trim();
  if (!/^[0-9A-Za-z]{6,40}$/.test(trimmed)) {
    return fail("rejected", "That doesn't look like a pixel id.");
  }

  const creds = await loadCredentials(organizationId, platform);
  if (!creds || creds.status !== "CONNECTED") {
    return fail("not_connected", "Connect the advertising account first.");
  }

  try {
    const pixel =
      platform === "TIKTOK"
        ? await fetchTikTokPixel(creds.externalAccountId, creds.accessToken, trimmed)
        : await fetchMetaPixel(trimmed, creds.accessToken);

    if (!pixel) {
      return fail("rejected", "That pixel isn't on the advertising account you connected.");
    }

    const row = await db.trackingPixel.upsert({
      where: { organizationId_platform: { organizationId, platform } },
      create: {
        organizationId,
        platform,
        externalPixelId: pixel.id,
        name: pixel.name,
        origin: "EXISTING",
        status: statusFrom(pixel.lastFiredAt),
        lastFiredAt: pixel.lastFiredAt,
        lastCheckedAt: new Date(),
      },
      update: {
        externalPixelId: pixel.id,
        name: pixel.name,
        origin: "EXISTING",
        status: statusFrom(pixel.lastFiredAt),
        lastFiredAt: pixel.lastFiredAt,
        lastCheckedAt: new Date(),
        lastError: null,
      },
    });

    return ok(toSnapshot(row));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't check that pixel.";
    return fail("rejected", message, error);
  }
}
