import { db } from "@/lib/db";
import type { AdPlatform, PixelStatus } from "@/generated/prisma/enums";
import { metaPixelSnippet, metaPurchaseSnippet } from "@/lib/tracking/meta-pixel";

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
// that has never fired says exactly that. Choosing, creating and checking a
// pixel live in lib/tracking/setup.ts, where every step is the owner's choice.

/** How long without an event before a pixel is treated as not working. */
const STALE_AFTER_HOURS = 48;

/**
 * Whether a campaign should optimize towards this pixel.
 *
 * Only ACTIVE, which PixelStatus documents as "the only good state" — the
 * network has actually seen an event from it. A pixel that exists but has
 * never fired is a pixel nobody installed, and asking an ad network to find
 * people likely to trigger an event it has no examples of is accepted and then
 * quietly under-delivers.
 *
 * Its own function so the launch path and this file cannot drift on what
 * "has tracking" means.
 */
export function canOptimizeTowards(status: PixelStatus): boolean {
  return status === "ACTIVE";
}

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

/** ACTIVE only when Meta saw an event within STALE_AFTER_HOURS; a pixel that has gone quiet isn't one to optimise towards. */
export function pixelStatusFrom(lastFiredAt: Date | null, now = new Date()): PixelStatus {
  if (!lastFiredAt) return "NO_EVENTS";
  return (now.getTime() - lastFiredAt.getTime()) / 36e5 <= STALE_AFTER_HOURS ? "ACTIVE" : "NO_EVENTS";
}

function snippetsFor(_platform: AdPlatform, pixelId: string) {
  return { baseSnippet: metaPixelSnippet(pixelId), purchaseSnippet: metaPurchaseSnippet() };
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

/** Every pixel this business has, with its snippets. */
export async function pixelsFor(organizationId: string): Promise<PixelSnapshot[]> {
  const rows = await db.trackingPixel.findMany({
    where: { organizationId },
    orderBy: { platform: "asc" },
  });
  return rows.map(toSnapshot);
}
