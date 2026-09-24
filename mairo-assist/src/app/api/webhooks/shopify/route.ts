import { after, NextResponse, type NextRequest } from "next/server";
import { isShopifyConfigured, isSupabaseAdminConfigured } from "@/lib/env";
import { drainJobs } from "@/lib/jobs/drain";
import { log } from "@/lib/log";
import { credentials } from "@/lib/shopify/config";
import { normalizeShopDomain, verifyWebhookHmac } from "@/lib/shopify/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const MAX_BODY_BYTES = 1_000_000;

/**
 * Shopify webhooks (store updates and the mandatory privacy topics). The
 * signature is checked against the raw body, the delivery is stored once
 * (retries share X-Shopify-Webhook-Id), and processing happens in the job
 * queue so Shopify gets its 200 quickly.
 */
export async function POST(request: NextRequest) {
  if (!isShopifyConfigured() || !isSupabaseAdminConfigured()) return new NextResponse("Not configured", { status: 503 });

  const raw = Buffer.from(await request.arrayBuffer());
  if (raw.length > MAX_BODY_BYTES) return new NextResponse("Payload too large", { status: 413 });
  if (!verifyWebhookHmac(raw, request.headers.get("x-shopify-hmac-sha256"), credentials().clientSecret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shop = normalizeShopDomain(request.headers.get("x-shopify-shop-domain"));
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? request.headers.get("x-shopify-event-id");
  if (!topic || !webhookId) return new NextResponse("Missing headers", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("integration_webhooks")
    .insert({ provider: "shopify", topic: topic.slice(0, 100), external_id: webhookId.slice(0, 200), shop_domain: shop, payload })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    log.error("shopify.webhook_store_failed", { topic, error: error.message });
    return new NextResponse("Could not store webhook", { status: 500 });
  }

  const { error: jobError } = await admin
    .from("background_jobs")
    .insert({ type: "shopify.webhook", payload: { webhook_id: row.id }, idempotency_key: `shopify-webhook:${row.id}` });
  if (jobError) {
    log.error("shopify.webhook_enqueue_failed", { topic, error: jobError.message });
    return new NextResponse("Could not queue webhook", { status: 500 });
  }

  after(() => drainJobs(`webhook-${row.id}`).catch((e) => log.warn("jobs.drain_failed", { error: String(e) })));
  return NextResponse.json({ ok: true });
}
