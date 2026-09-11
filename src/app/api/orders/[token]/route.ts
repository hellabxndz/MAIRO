import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptSecret } from "@/lib/crypto/secret-box";
import {
  noteIngestReceived,
  organizationForToken,
  recordOrder,
  type IncomingOrder,
} from "@/lib/tracking/orders";
import type { OrderSource } from "@/generated/prisma/enums";

// Where a customer's shop tells MAIRO that somebody bought something.
//
// Public by necessity — a Shopify webhook has no way to carry a session — so
// the token in the path is the whole of the authentication, and everything
// below treats the body as hostile. What an attacker with a leaked token could
// do is inject fake orders into one business's own reporting, which is why the
// token is long, rotatable, and scoped to exactly one organization.
//
// Shopify additionally signs every delivery, and where the business has given
// MAIRO the signing secret that signature is required. A store that sends one
// and fails it is rejected rather than downgraded to token-only: a valid
// signature going bad means something is wrong, not that the check should be
// skipped.

export const maxDuration = 30;

type ShopifyOrder = {
  id?: number | string;
  order_number?: number | string;
  total_price?: string;
  current_total_price?: string;
  currency?: string;
  created_at?: string;
  email?: string;
  phone?: string;
  browser_ip?: string;
  client_details?: { user_agent?: string; browser_ip?: string };
  customer?: { email?: string; phone?: string };
  shipping_address?: { country_code?: string; phone?: string };
  billing_address?: { country_code?: string; phone?: string };
  order_status_url?: string;
  financial_status?: string;
  test?: boolean;
};

type GenericOrder = {
  order_id?: string | number;
  id?: string | number;
  value?: number | string;
  total?: number | string;
  value_cents?: number;
  currency?: string;
  occurred_at?: string;
  created_at?: string;
  email?: string;
  phone?: string;
  country?: string;
  client_ip?: string;
  user_agent?: string;
  fbclid?: string;
  ttclid?: string;
  source_url?: string;
  event_name?: string;
};

function bad(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Money as a string of whole units — "49.99" — into integer cents. */
function unitsToCents(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  // Rounded rather than truncated: 19.99 * 100 is 1998.9999... in binary
  // floating point, and truncating would quietly lose a cent on a great many
  // orders — which shows up later as a revenue total that never reconciles.
  return Math.round(n * 100);
}

function verifyShopify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  // Length must match before timingSafeEqual, which throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

function fromShopify(body: ShopifyOrder): IncomingOrder | string {
  const id = body.id ?? body.order_number;
  if (id === undefined) return "The order had no id.";

  const cents = unitsToCents(body.current_total_price ?? body.total_price);
  if (cents === null) return "The order had no total.";

  return {
    externalOrderId: String(id),
    valueCents: cents,
    currency: body.currency ?? "USD",
    occurredAt: body.created_at ? new Date(body.created_at) : new Date(),
    email: body.email ?? body.customer?.email ?? null,
    phone: body.phone ?? body.customer?.phone ?? body.shipping_address?.phone ?? null,
    country: body.shipping_address?.country_code ?? body.billing_address?.country_code ?? null,
    clientIp: body.client_details?.browser_ip ?? body.browser_ip ?? null,
    userAgent: body.client_details?.user_agent ?? null,
    sourceUrl: body.order_status_url ?? null,
  };
}

function fromGeneric(body: GenericOrder): IncomingOrder | string {
  const id = body.order_id ?? body.id;
  if (id === undefined) return "Include an order_id.";

  const cents =
    typeof body.value_cents === "number"
      ? Math.round(body.value_cents)
      : unitsToCents(body.value ?? body.total);
  if (cents === null) return "Include the order value, as a number like 49.99.";

  const when = body.occurred_at ?? body.created_at;
  return {
    externalOrderId: String(id),
    valueCents: cents,
    currency: body.currency ?? "USD",
    occurredAt: when ? new Date(when) : new Date(),
    email: body.email ?? null,
    phone: body.phone ?? null,
    country: body.country ?? null,
    clientIp: body.client_ip ?? null,
    userAgent: body.user_agent ?? null,
    fbclid: body.fbclid ?? null,
    ttclid: body.ttclid ?? null,
    sourceUrl: body.source_url ?? null,
    eventName: body.event_name,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const ingest = await organizationForToken(token);
  // Deliberately the same answer as a malformed token: an attacker probing
  // tokens learns nothing about which ones exist.
  if (!ingest) return bad("Unknown endpoint.", 404);

  const raw = await req.text();
  if (raw.length > 512_000) return bad("That order payload is too large.", 413);

  const shopifyHeader = req.headers.get("x-shopify-hmac-sha256");
  const shopDomain = req.headers.get("x-shopify-shop-domain");

  // A store that has given MAIRO its signing secret must sign every delivery.
  if (ingest.shopifySecret) {
    let secret: string;
    try {
      secret = decryptSecret(ingest.shopifySecret);
    } catch {
      return bad("This endpoint is misconfigured. Reconnect your store in MAIRO.", 500);
    }
    if (!verifyShopify(raw, shopifyHeader, secret)) {
      return bad("Signature check failed.", 401);
    }
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return bad("That wasn't JSON.");
  }
  if (typeof body !== "object" || body === null) return bad("That wasn't an order.");

  const looksLikeShopify = Boolean(shopifyHeader || shopDomain);
  const source: OrderSource = looksLikeShopify ? "SHOPIFY" : "CUSTOM";

  // Shopify sends test webhooks from the admin. Recording one as revenue would
  // put a fake sale in the customer's ROAS on the day they set this up.
  if (looksLikeShopify && (body as ShopifyOrder).test === true) {
    return NextResponse.json({ ok: true, recorded: false, reason: "test order ignored" });
  }

  const parsed = looksLikeShopify
    ? fromShopify(body as ShopifyOrder)
    : fromGeneric(body as GenericOrder);

  if (typeof parsed === "string") return bad(parsed);
  if (!Number.isFinite(parsed.occurredAt.getTime())) return bad("That order had an unreadable date.");

  await noteIngestReceived(ingest.organizationId);

  try {
    const result = await recordOrder(ingest.organizationId, source, parsed);
    return NextResponse.json({
      ok: true,
      recorded: result.created,
      eventId: result.eventId,
      forwarded: result.forwarded.map((f) => ({ platform: f.platform, status: f.status })),
    });
  } catch (error) {
    // A 500 makes Shopify retry, which is what we want for a transient
    // problem — the order is deduped on the way back in, so a retry cannot
    // double-count it.
    console.error("Order ingest failed:", error);
    return bad("Couldn't record that order. It will be retried.", 500);
  }
}
