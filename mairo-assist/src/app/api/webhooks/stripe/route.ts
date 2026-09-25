import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { applyStripeSubscription, confirmCheckout } from "@/lib/billing/service";
import { stripeConfig, verifyStripeSignature, type StripeSubscription } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

/**
 * Stripe webhooks: signature checked on the raw body, each event handled once
 * (integration_webhooks is unique on the event ID), and every change applied
 * through the same code as the checkout return page.
 */
export async function POST(request: NextRequest) {
  const { webhookSecret } = stripeConfig();
  if (!webhookSecret || !isSupabaseAdminConfigured()) return new NextResponse("Not configured", { status: 503 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return new NextResponse("Payload too large", { status: 413 });
  if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), webhookSecret)) return new NextResponse("Unauthorized", { status: 401 });

  let event: StripeEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("integration_webhooks")
    .insert({ provider: "stripe", topic: event.type.slice(0, 100), external_id: event.id, payload: event })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    return new NextResponse("Could not store event", { status: 500 });
  }

  try {
    const outcome = await handle(event);
    await admin.from("integration_webhooks").update({ status: outcome, processed_at: new Date().toISOString() }).eq("id", row.id);
    return NextResponse.json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("stripe.webhook_failed", { type: event.type, error: message });
    // Let Stripe retry: remove the dedupe row so the retry is processed.
    await admin.from("integration_webhooks").delete().eq("id", row.id);
    return new NextResponse("Processing failed", { status: 500 });
  }
}

async function businessForSubscription(subscriptionId: string) {
  const { data } = await createAdminClient().from("subscriptions").select("business_id").eq("provider", "stripe").eq("provider_subscription_id", subscriptionId).maybeSingle();
  return (data?.business_id as string | undefined) ?? null;
}

async function handle(event: StripeEvent): Promise<"processed" | "ignored"> {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const businessId = typeof obj.client_reference_id === "string" ? obj.client_reference_id : null;
      if (!businessId || typeof obj.id !== "string") return "ignored";
      const outcome = await confirmCheckout(obj.id, businessId);
      if (outcome === "failed") throw new Error("Could not confirm checkout");
      return outcome === "not_found" ? "ignored" : "processed";
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = obj as unknown as StripeSubscription;
      const businessId = await businessForSubscription(sub.id);
      if (!businessId) return "ignored";
      await applyStripeSubscription(businessId, sub);
      return "processed";
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subId = invoiceSubscription(obj);
      const businessId = subId ? await businessForSubscription(subId) : null;
      if (!businessId || typeof obj.id !== "string") return "ignored";
      const { error } = await createAdminClient()
        .from("invoices")
        .upsert(
          {
            business_id: businessId,
            provider: "stripe",
            provider_invoice_id: obj.id,
            amount_cents: Number(obj.amount_paid ?? obj.amount_due ?? 0),
            currency: String(obj.currency ?? "usd"),
            status: event.type === "invoice.paid" ? "paid" : "open",
            hosted_url: typeof obj.hosted_invoice_url === "string" ? obj.hosted_invoice_url : null,
            period_start: typeof obj.period_start === "number" ? new Date(obj.period_start * 1000).toISOString() : null,
            period_end: typeof obj.period_end === "number" ? new Date(obj.period_end * 1000).toISOString() : null,
          },
          { onConflict: "provider,provider_invoice_id" },
        );
      if (error) throw new Error(error.message);
      return "processed";
    }
  }
  return "ignored";
}

/** The subscription an invoice belongs to (the field moved in newer API versions). */
function invoiceSubscription(inv: Record<string, unknown>): string | null {
  if (typeof inv.subscription === "string") return inv.subscription;
  const parent = inv.parent as { subscription_details?: { subscription?: string } } | undefined;
  return parent?.subscription_details?.subscription ?? null;
}
