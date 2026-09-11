import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import type { AdPlatform, OrderSource } from "@/generated/prisma/enums";
import { loadCredentials } from "@/lib/ad-platforms/connections";
import {
  deriveEventId,
  hashEmail,
  hashPhone,
  normalizeCountry,
} from "@/lib/tracking/hash";
import { sendMetaConversions } from "@/lib/tracking/meta-pixel";
import { sendTikTokConversions } from "@/lib/tracking/tiktok-pixel";

// Orders in, conversions out.
//
// This is the half of measurement that makes ROAS mean something. A browser
// pixel reports what survived the trip — ad blockers, iOS tracking prompts and
// Safari's cookie policy between them lose a real fraction of conversions, and
// the networks only ever know about what reached them. The store knows what
// was actually sold.
//
// So the store tells MAIRO about every order, MAIRO relays it to each network
// server-side where the browser could not, and keeps the order as the record
// against which the networks' own claims can be checked. The relay carries the
// same event id the browser used, so a sale that made it both ways is counted
// once.
//
// Two invariants everything here protects:
//
// An order is recorded once. Shopify retries webhooks, and a retry that landed
// as a second order would inflate revenue — and a customer who trusts an
// inflated ROAS spends more money because of it.
//
// Nothing identifying is stored in the clear. The email arrives, is hashed,
// and the original is never written down.

export type IncomingOrder = {
  /** The store's own order id. The dedup key and the event id's source. */
  externalOrderId: string;
  valueCents: number;
  currency: string;
  occurredAt: Date;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  /** The shopper's, not the store's — from the webhook where it is given. */
  clientIp?: string | null;
  userAgent?: string | null;
  /** Click ids, if the store captured them on the landing page. */
  fbclid?: string | null;
  ttclid?: string | null;
  sourceUrl?: string | null;
  eventName?: string;
};

export type RecordResult = {
  eventId: string;
  /** False when this order had already been recorded. */
  created: boolean;
  forwarded: { platform: AdPlatform; status: string; message: string | null }[];
};

/**
 * Records one order and relays it to every network the business advertises on.
 *
 * Returns rather than throws for every ordinary failure, because the caller is
 * a webhook: a store that gets a 500 will retry, and retrying will not fix a
 * network refusing an event. The order is saved either way — MAIRO's own
 * record of what was sold must not depend on Meta having a good afternoon.
 */
export async function recordOrder(
  organizationId: string,
  source: OrderSource,
  order: IncomingOrder
): Promise<RecordResult> {
  const eventId = deriveEventId(order.externalOrderId);
  const country = normalizeCountry(order.country);

  // Hashed here, at the boundary, so nothing downstream ever sees the raw
  // values — including the database, the logs and the error paths.
  const hashedEmail = hashEmail(order.email);
  const hashedPhone = hashPhone(order.phone, phoneCountryHint(country));

  const existing = await db.conversionEvent.findUnique({
    where: {
      organizationId_externalOrderId: {
        organizationId,
        externalOrderId: order.externalOrderId,
      },
    },
    include: { forwards: true },
  });

  if (existing) {
    // A redelivery. Already counted, so it is not counted again — but if the
    // first attempt failed to reach a network, this is a free chance to retry
    // it rather than losing the conversion permanently.
    const unsent = existing.forwards.filter((f) => f.status === "FAILED" || f.status === "PENDING");
    if (unsent.length === 0) {
      return { eventId: existing.eventId, created: false, forwarded: [] };
    }
    const retried = await forwardAll(organizationId, existing.id, {
      ...order,
      eventId: existing.eventId,
      hashedEmail: existing.hashedEmail,
      hashedPhone: existing.hashedPhone,
      country: existing.country,
    });
    return { eventId: existing.eventId, created: false, forwarded: retried };
  }

  const event = await db.conversionEvent.create({
    data: {
      organizationId,
      source,
      externalOrderId: order.externalOrderId,
      eventId,
      eventName: order.eventName ?? "Purchase",
      valueCents: Math.max(0, Math.round(order.valueCents)),
      currency: (order.currency || "USD").toUpperCase().slice(0, 3),
      occurredAt: order.occurredAt,
      hashedEmail,
      hashedPhone,
      country,
      clientIp: order.clientIp ?? null,
      userAgent: order.userAgent ?? null,
      fbclid: order.fbclid ?? null,
      ttclid: order.ttclid ?? null,
    },
  });

  const forwarded = await forwardAll(organizationId, event.id, {
    ...order,
    eventId,
    hashedEmail,
    hashedPhone,
    country,
  });

  return { eventId, created: true, forwarded };
}

/** A country hint for phone normalization, from the order's own country. */
function phoneCountryHint(country: string | null): string | null {
  if (!country) return null;
  const codes: Record<string, string> = {
    us: "1",
    ca: "1",
    gb: "44",
    ie: "353",
    au: "61",
    nz: "64",
    de: "49",
    fr: "33",
    es: "34",
    it: "39",
    nl: "31",
  };
  return codes[country] ?? null;
}

type ForwardInput = IncomingOrder & {
  eventId: string;
  hashedEmail: string | null;
  hashedPhone: string | null;
  country: string | null;
};

/**
 * Sends one order to every network that has both a connection and a pixel.
 *
 * A network with no pixel is SKIPPED rather than FAILED. It is not a problem
 * with the order — the business simply isn't tracking there yet — and marking
 * it as a failure would fill the customer's page with red for something that
 * is working exactly as configured.
 */
async function forwardAll(
  organizationId: string,
  conversionEventId: string,
  order: ForwardInput
): Promise<{ platform: AdPlatform; status: string; message: string | null }[]> {
  const pixels = await db.trackingPixel.findMany({ where: { organizationId } });
  const platforms: AdPlatform[] = ["META", "TIKTOK"];
  const out: { platform: AdPlatform; status: string; message: string | null }[] = [];

  for (const platform of platforms) {
    const pixel = pixels.find((p) => p.platform === platform);
    if (!pixel) {
      await upsertForward(conversionEventId, platform, "SKIPPED", "No pixel on this network yet.");
      out.push({ platform, status: "SKIPPED", message: null });
      continue;
    }

    const creds = await loadCredentials(organizationId, platform);
    if (!creds || creds.status !== "CONNECTED") {
      await upsertForward(conversionEventId, platform, "SKIPPED", "Account not connected.");
      out.push({ platform, status: "SKIPPED", message: null });
      continue;
    }

    try {
      const result =
        platform === "TIKTOK"
          ? await sendTikTokConversions(pixel.externalPixelId, creds.accessToken, [
              {
                eventName: mapEventName(order.eventName ?? "Purchase", "TIKTOK"),
                eventTime: order.occurredAt,
                eventId: order.eventId,
                valueCents: order.valueCents,
                currency: order.currency,
                hashedEmail: order.hashedEmail,
                hashedPhone: order.hashedPhone,
                clientIp: order.clientIp,
                userAgent: order.userAgent,
                ttclid: order.ttclid,
                sourceUrl: order.sourceUrl,
              },
            ])
          : await sendMetaConversions(pixel.externalPixelId, creds.accessToken, [
              {
                eventName: mapEventName(order.eventName ?? "Purchase", "META"),
                eventTime: order.occurredAt,
                eventId: order.eventId,
                valueCents: order.valueCents,
                currency: order.currency,
                hashedEmail: order.hashedEmail,
                hashedPhone: order.hashedPhone,
                country: order.country,
                clientIp: order.clientIp,
                userAgent: order.userAgent,
                // Meta wants its click id wrapped in a versioned, timestamped
                // form rather than the bare parameter off the URL.
                fbc: order.fbclid
                  ? `fb.1.${Math.floor(order.occurredAt.getTime())}.${order.fbclid}`
                  : null,
                sourceUrl: order.sourceUrl,
              },
            ]);

      // A network taking the event is not the same as it matching it to
      // anybody. Nothing identifying means nothing attributed, and saying so
      // here is the difference between a customer fixing their store's webhook
      // and wondering for a month why their ROAS is zero.
      const status = result.matchFields === 0 ? "ACCEPTED_WITH_WARNINGS" : "SENT";
      const message =
        result.matchFields === 0
          ? "Sent, but with nothing to match it to a person — the order had no email, phone or click id."
          : result.messages.join(" ") || null;

      await upsertForward(conversionEventId, platform, status, message, result.matchFields);
      out.push({ platform, status, message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The network refused it.";
      await upsertForward(conversionEventId, platform, "FAILED", message);
      out.push({ platform, status: "FAILED", message });
    }
  }

  return out;
}

/**
 * The two networks disagree about what a purchase is called.
 *
 * Meta's standard event is `Purchase`; TikTok's is `CompletePayment`. Sending
 * Meta's name to TikTok is accepted as a custom event, which cannot be
 * optimized towards and does not appear in the conversion column — so the
 * campaign quietly optimizes for nothing.
 */
function mapEventName(name: string, platform: AdPlatform): string {
  if (platform !== "TIKTOK") return name;
  const map: Record<string, string> = {
    Purchase: "CompletePayment",
    AddToCart: "AddToCart",
    InitiateCheckout: "InitiateCheckout",
    Lead: "SubmitForm",
    CompleteRegistration: "CompleteRegistration",
  };
  return map[name] ?? name;
}

async function upsertForward(
  eventId: string,
  platform: AdPlatform,
  status: string,
  message: string | null,
  matchedFields?: number
): Promise<void> {
  const data = {
    status: status as "PENDING" | "SENT" | "ACCEPTED_WITH_WARNINGS" | "FAILED" | "SKIPPED",
    message,
    matchedFields: matchedFields ?? null,
    sentAt: status === "SENT" || status === "ACCEPTED_WITH_WARNINGS" ? new Date() : null,
  };
  await db.conversionForward.upsert({
    where: { eventId_platform: { eventId, platform } },
    create: { eventId, platform, ...data },
    update: data,
  });
}

// --- the endpoint the store posts to ---------------------------------------

/**
 * The business's own ingest URL, created on first use.
 *
 * A token in the path rather than a header, because what is on the other end
 * is usually a Shopify webhook field or a plugin's settings box that takes a
 * URL and nothing else. It is long enough to be unguessable, and rotating it
 * is how a business revokes a store's access.
 */
export async function ensureIngest(organizationId: string): Promise<{
  token: string;
  hasShopifySecret: boolean;
  lastReceivedAt: Date | null;
  receivedCount: number;
}> {
  const existing = await db.storeIngest.findUnique({ where: { organizationId } });
  if (existing) {
    return {
      token: existing.token,
      hasShopifySecret: Boolean(existing.shopifySecret),
      lastReceivedAt: existing.lastReceivedAt,
      receivedCount: existing.receivedCount,
    };
  }

  const created = await db.storeIngest.create({
    data: { organizationId, token: randomBytes(24).toString("base64url") },
  });
  return {
    token: created.token,
    hasShopifySecret: false,
    lastReceivedAt: null,
    receivedCount: 0,
  };
}

export async function rotateIngestToken(organizationId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.storeIngest.update({ where: { organizationId }, data: { token } });
  return token;
}

/** Resolves an ingest token to the business it belongs to. */
export async function organizationForToken(token: string): Promise<{
  organizationId: string;
  shopifySecret: string | null;
} | null> {
  const row = await db.storeIngest.findUnique({ where: { token } });
  if (!row) return null;
  return { organizationId: row.organizationId, shopifySecret: row.shopifySecret };
}

export async function noteIngestReceived(organizationId: string): Promise<void> {
  await db.storeIngest
    .update({
      where: { organizationId },
      data: { lastReceivedAt: new Date(), receivedCount: { increment: 1 } },
    })
    .catch(() => undefined);
}
