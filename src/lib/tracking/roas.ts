import { db } from "@/lib/db";
import type { AdPlatform } from "@/generated/prisma/enums";

// Two ROAS numbers, and why the product shows both.
//
// ATTRIBUTED is what the ad network claims. Meta says "of the people who saw
// your ad, these ones bought, and here is the revenue." It is per-campaign,
// it is what optimization runs on, and it is the only one that can tell you
// which ad worked. It is also systematically incomplete — it only knows about
// conversions that reached it — and systematically generous, because every
// network counts a sale it had any hand in and two networks will happily claim
// the same one.
//
// MEASURED is arithmetic on facts: everything the business sold, divided by
// everything it spent on ads. It cannot tell you which ad worked. It is not
// fooled by anything, and it is the number the business's bank account agrees
// with.
//
// A business owner who is shown only the first thinks advertising is going
// better than it is. One shown only the second cannot make a decision with it.
// So both are shown, side by side, labelled as what they are, and the gap
// between them is explained rather than hidden — because the gap is the most
// informative thing on the page. A large one means either the tracking is
// broken or a lot of sales are coming from somewhere other than the ads, and
// those need different responses.

export type RoasPeriod = { since: Date; until: Date };

export type MeasuredSales = {
  /** Orders MAIRO was told about in the period. */
  orderCount: number;
  revenueCents: number;
  currency: string;
  /** True when orders arrived in more than one currency — see below. */
  mixedCurrency: boolean;
  /** Orders that reached at least one network with something to match on. */
  matchedCount: number;
  /** Orders no network could attribute to a person. */
  unmatchedCount: number;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
};

/**
 * What the business actually sold, from its own orders.
 *
 * Currency is the sharp edge. Summing 100 USD and 100 EUR into "200" is a
 * number that means nothing, and MAIRO holds no exchange rates — so a business
 * selling in more than one currency gets the majority currency's total with
 * mixedCurrency set, and the page says so rather than quoting a figure that
 * silently added pounds to dollars.
 */
export async function measuredSales(
  organizationId: string,
  period: RoasPeriod
): Promise<MeasuredSales> {
  const orders = await db.conversionEvent.findMany({
    where: {
      organizationId,
      occurredAt: { gte: period.since, lte: period.until },
    },
    select: {
      valueCents: true,
      currency: true,
      occurredAt: true,
      forwards: { select: { matchedFields: true, status: true } },
    },
    orderBy: { occurredAt: "asc" },
  });

  if (orders.length === 0) {
    return {
      orderCount: 0,
      revenueCents: 0,
      currency: "USD",
      mixedCurrency: false,
      matchedCount: 0,
      unmatchedCount: 0,
      firstOrderAt: null,
      lastOrderAt: null,
    };
  }

  const byCurrency = new Map<string, number>();
  for (const o of orders) {
    byCurrency.set(o.currency, (byCurrency.get(o.currency) ?? 0) + o.valueCents);
  }

  const ranked = [...byCurrency.entries()].sort((a, b) => b[1] - a[1]);
  const [currency, revenueCents] = ranked[0];

  let matched = 0;
  for (const o of orders) {
    // One network with something to match on is enough for the order to have
    // had a chance of being attributed.
    if (o.forwards.some((f) => (f.matchedFields ?? 0) > 0)) matched++;
  }

  return {
    orderCount: orders.length,
    revenueCents,
    currency,
    mixedCurrency: ranked.length > 1,
    matchedCount: matched,
    unmatchedCount: orders.length - matched,
    firstOrderAt: orders[0].occurredAt,
    lastOrderAt: orders[orders.length - 1].occurredAt,
  };
}

export type RoasComparison = {
  /** Everything spent on ads in the period, across networks. */
  spendCents: number;
  /** What the networks between them claim they caused. */
  attributedRevenueCents: number | null;
  attributedRoas: number | null;
  /** What the business actually took. */
  measuredRevenueCents: number;
  measuredRoas: number | null;
  orderCount: number;
  currency: string;
  mixedCurrency: boolean;
  /** How many orders no network could match to a person. */
  unmatchedCount: number;
  /** What the gap between the two most likely means. Never invented. */
  reading: RoasReading;
};

export type RoasReading =
  | "no_spend"
  | "no_orders"
  | "no_attribution"
  /** The networks claim roughly what the business actually took. */
  | "agrees"
  /** The networks see much less than the business sold. */
  | "under_reporting"
  /** The networks claim more than the business sold — double counting. */
  | "over_claiming";

/** How far apart the two numbers have to be before it is worth saying. */
const AGREEMENT_BAND = 0.25;

export function compareRoas(input: {
  spendCents: number;
  attributedRevenueCents: number | null;
  measured: MeasuredSales;
}): RoasComparison {
  const { spendCents, attributedRevenueCents, measured } = input;

  const attributedRoas =
    attributedRevenueCents !== null && spendCents > 0
      ? attributedRevenueCents / spendCents
      : null;
  const measuredRoas = spendCents > 0 ? measured.revenueCents / spendCents : null;

  let reading: RoasReading;
  if (spendCents <= 0) {
    reading = "no_spend";
  } else if (measured.orderCount === 0) {
    reading = "no_orders";
  } else if (attributedRevenueCents === null) {
    reading = "no_attribution";
  } else {
    // Compared as a ratio rather than a difference: a £40 gap means something
    // very different on £100 of revenue than on £100,000.
    const ratio = measured.revenueCents > 0 ? attributedRevenueCents / measured.revenueCents : 0;
    if (ratio > 1 + AGREEMENT_BAND) reading = "over_claiming";
    else if (ratio < 1 - AGREEMENT_BAND) reading = "under_reporting";
    else reading = "agrees";
  }

  return {
    spendCents,
    attributedRevenueCents,
    attributedRoas,
    measuredRevenueCents: measured.revenueCents,
    measuredRoas,
    orderCount: measured.orderCount,
    currency: measured.currency,
    mixedCurrency: measured.mixedCurrency,
    unmatchedCount: measured.unmatchedCount,
    reading,
  };
}

/**
 * What to tell the customer about the gap.
 *
 * Every one of these names a cause and a next step. "Your numbers don't match"
 * is not useful to somebody who does not know what a pixel is; "the ads are
 * only seeing a third of your sales, which usually means the pixel isn't on
 * your checkout page" is.
 */
export function explainReading(reading: RoasReading, unmatchedCount: number): string {
  switch (reading) {
    case "no_spend":
      return "Nothing has been spent on ads in this period, so there is no return to divide by.";
    case "no_orders":
      return "MAIRO hasn't been told about any orders in this period. Once your shop is sending them, the real figure appears here.";
    case "no_attribution":
      return "The ad networks haven't reported any revenue yet. That is normal for the first day or two of a campaign, and after that it usually means the pixel isn't firing on your checkout page.";
    case "agrees":
      return "The networks' figures line up with what you actually sold, so the ROAS above can be trusted.";
    case "under_reporting":
      return (
        "The ad networks can see noticeably less revenue than you actually took. " +
        (unmatchedCount > 0
          ? `${unmatchedCount} of your orders reached them with nothing to match to a person — usually a missing email on the order. `
          : "") +
        "Some of that is normal (ad blockers and iPhone privacy settings account for a chunk), but a big gap usually means the pixel isn't on every page it should be."
      );
    case "over_claiming":
      return (
        "The ad networks are claiming more revenue than you actually took. That is almost always double counting: " +
        "the same sale reaching a network twice, once from your website and once from MAIRO, without a matching order id to tie them together. " +
        "Check the order-confirmation snippet on your site uses the event id exactly as MAIRO gives it."
      );
  }
}

/** Recent orders for the page, with what happened to each. */
export async function recentOrders(organizationId: string, take = 15) {
  return db.conversionEvent.findMany({
    where: { organizationId },
    orderBy: { occurredAt: "desc" },
    take,
    select: {
      id: true,
      externalOrderId: true,
      source: true,
      valueCents: true,
      currency: true,
      occurredAt: true,
      hashedEmail: true,
      forwards: {
        select: { platform: true, status: true, message: true, matchedFields: true },
      },
    },
  });
}

/** Which networks this business is set up to measure on. */
export async function trackedPlatforms(organizationId: string): Promise<AdPlatform[]> {
  const rows = await db.trackingPixel.findMany({
    where: { organizationId },
    select: { platform: true },
  });
  return rows.map((r) => r.platform);
}
