import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { escapeHtml, sendEmail } from "@/lib/mail";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/security/rate-limit";
import { safeEqual, sha256Hex } from "@/lib/security/tokens";
import { shopifyClient } from "@/lib/shopify/client";
import { refreshOrder } from "@/lib/shopify/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ToolOutcome } from "./agent";

/*
 * Order lookup for customers, behind a one-time code sent to the email on the
 * order. Nothing about an order (not even whether it exists) is revealed until
 * the code is verified, and afterwards only orders on that same email.
 */

const CODE_TTL_MS = 10 * 60_000;
const VERIFIED_FOR_MS = 30 * 60_000;
const LIVE_REFRESH_TIMEOUT_MS = 4_000;

type Ctx = { businessId: string; conversationId: string; mode: "live" | "preview" };

export const emailHash = (email: string) => sha256Hex(`email:${email.trim().toLowerCase()}`);
const codeHash = (verificationId: string, code: string) => sha256Hex(`code:${verificationId}:${code}`);

/** "#1001", "1001", "order 1001" → "#1001". */
export function normalizeOrderName(input: string) {
  const digits = input.replace(/[^0-9A-Za-z-]/g, "").replace(/^order/i, "");
  return digits ? `#${digits.replace(/^#/, "")}` : null;
}

const SAME_ANSWER = {
  status: "success" as const,
  output: {
    result:
      "If that order number and email match an order, a 6-digit code has been emailed to that address. Ask the customer to type the code here. Don't say whether the order exists.",
  },
};

export async function requestOrderVerification(ctx: Ctx, input: { order_number: string; email: string }): Promise<ToolOutcome> {
  if (ctx.mode === "preview") {
    return { status: "success", output: { result: "PREVIEW: in a live chat a one-time code would be emailed to the address on the order. Codes can't be sent from the preview." } };
  }
  const email = input.email.trim().toLowerCase();
  const name = normalizeOrderName(input.order_number);
  const allowed = (await rateLimit(`verify-req:${ctx.conversationId}`, 3, 3600)) && (await rateLimit(`verify-email:${emailHash(email)}`, 5, 3600));
  if (!allowed) return { status: "denied", output: { error: "Too many code requests. Ask the customer to try again later, or offer the team's help." } };
  if (!name) return SAME_ANSWER;

  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("id, name, email").eq("business_id", ctx.businessId).eq("name", name).maybeSingle();
  // Same answer whether or not the order exists or the email matches.
  if (!order?.email || !safeEqual(order.email, email)) return SAME_ANSWER;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const id = randomUUID();
  const { data: v, error } = await admin
    .from("order_verifications")
    .insert({ id, business_id: ctx.businessId, conversation_id: ctx.conversationId, order_id: order.id, email_hash: emailHash(email), code_hash: codeHash(id, code), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() })
    .select("id")
    .single();
  if (error || !v) return { status: "error", output: { error: "Couldn't start verification." } };

  const [{ data: business }, { data: settings }] = await Promise.all([
    admin.from("businesses").select("name").eq("id", ctx.businessId).single(),
    admin.from("business_settings").select("support_email").eq("business_id", ctx.businessId).single(),
  ]);
  const store = business?.name ?? "the store";
  try {
    await sendEmail({
      to: email,
      subject: `Your ${store} verification code: ${code}`,
      text: `Your code to look up order ${order.name} with ${store}'s assistant is ${code}. It expires in 10 minutes. If you didn't ask for this, you can ignore this email.`,
      html: `<p>Your code to look up order <strong>${escapeHtml(order.name)}</strong> with ${escapeHtml(store)}'s assistant is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you didn't ask for this, you can ignore this email.</p>`,
      replyTo: settings?.support_email ?? null,
    });
  } catch (e) {
    log.warn("order_verification.email_failed", { error: e instanceof Error ? e.message : String(e) });
    await admin.from("order_verifications").delete().eq("id", v.id);
    return { status: "error", output: { error: "The verification email couldn't be sent. Apologise and offer the team's help." } };
  }
  return SAME_ANSWER;
}

export async function verifyOrderCode(ctx: Ctx, input: { code: string }): Promise<ToolOutcome> {
  if (ctx.mode === "preview") return { status: "denied", output: { error: "PREVIEW: verification only works in a live chat." } };
  const code = input.code.replace(/\D/g, "");
  const admin = createAdminClient();
  const { data: v } = await admin
    .from("order_verifications")
    .select("id, email_hash, code_hash, attempts, max_attempts, expires_at")
    .eq("business_id", ctx.businessId)
    .eq("conversation_id", ctx.conversationId)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!v || Date.parse(v.expires_at) < Date.now()) {
    return { status: "success", output: { verified: false, result: "There's no active code. Offer to send a new one (ask for the order number and email again)." } };
  }
  if (v.attempts >= v.max_attempts) {
    return { status: "success", output: { verified: false, result: "Too many wrong attempts. Offer to send a new code." } };
  }
  await admin.from("order_verifications").update({ attempts: v.attempts + 1 }).eq("id", v.id);
  if (code.length !== 6 || !safeEqual(codeHash(v.id, code), v.code_hash)) {
    return { status: "success", output: { verified: false, result: "That code isn't right. Ask the customer to check it and try again." } };
  }
  const now = new Date();
  await admin.from("order_verifications").update({ verified_at: now.toISOString() }).eq("id", v.id);
  await admin
    .from("conversations")
    .update({ verified_email_hash: v.email_hash, verified_until: new Date(now.getTime() + VERIFIED_FOR_MS).toISOString() })
    .eq("id", ctx.conversationId)
    .eq("business_id", ctx.businessId);
  return { status: "success", output: { verified: true, result: "Verified. You can now use get_order_status for this customer's orders." } };
}

export async function getOrderStatus(ctx: Ctx, input: { order_number: string }): Promise<ToolOutcome> {
  const admin = createAdminClient();
  const { data: conv } = await admin.from("conversations").select("verified_email_hash, verified_until").eq("id", ctx.conversationId).eq("business_id", ctx.businessId).single();
  if (!conv?.verified_email_hash || !conv.verified_until || Date.parse(conv.verified_until) < Date.now()) {
    return { status: "denied", output: { error: "The customer isn't verified. Use request_order_verification first." } };
  }
  const name = normalizeOrderName(input.order_number);
  const { data: found } = name
    ? await admin.from("orders").select("id, shopify_gid, email").eq("business_id", ctx.businessId).eq("name", name).maybeSingle()
    : { data: null };
  if (!found?.email || emailHash(found.email) !== conv.verified_email_hash) {
    return { status: "success", output: { result: "No order with that number on the verified email. Ask them to check the number." } };
  }

  // Refresh from Shopify so status and tracking are current; fall back to the last sync.
  let live = false;
  const { data: conn } = await admin.from("shopify_connections").select("id, customer_data_enabled").eq("business_id", ctx.businessId).eq("status", "active").maybeSingle();
  if (conn) {
    try {
      const client = await shopifyClient(conn.id, ctx.businessId);
      await Promise.race([
        refreshOrder(client, found.shopify_gid, Boolean(conn.customer_data_enabled)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), LIVE_REFRESH_TIMEOUT_MS)),
      ]);
      live = true;
    } catch (e) {
      log.info("order_status.live_refresh_failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  const { data: order } = await admin
    .from("orders")
    .select("name, processed_at, financial_status, fulfillment_status, display_status, cancelled_at, currency, total_price, status_page_url, synced_at, order_items(title, variant_title, quantity), fulfillments(display_status, tracking, shipped_at, delivered_at, estimated_delivery_at)")
    .eq("id", found.id)
    .single();
  if (!order) return { status: "error", output: { error: "Couldn't read the order." } };
  await admin.from("analytics_events").insert({ business_id: ctx.businessId, event_type: "order_lookup", conversation_id: ctx.conversationId });
  return {
    status: "success",
    output: {
      note: "The verified customer's own order. Share only what's here; don't guess delivery dates that aren't listed. Refunds, cancellations and changes need the team.",
      checked: live ? "live from the store just now" : `from the last store sync at ${order.synced_at}`,
      order: {
        number: order.name,
        placed: order.processed_at,
        status: order.cancelled_at ? "cancelled" : order.display_status,
        payment: order.financial_status,
        fulfillment: order.fulfillment_status,
        total: order.total_price === null ? null : `${Number(order.total_price).toFixed(2)} ${order.currency ?? ""}`.trim(),
        items: (order.order_items ?? []).map((i) => `${i.quantity} × ${i.title}${i.variant_title ? ` (${i.variant_title})` : ""}`),
        shipments: (order.fulfillments ?? []).map((f) => ({
          status: f.display_status,
          shipped: f.shipped_at,
          delivered: f.delivered_at,
          estimated_delivery: f.estimated_delivery_at,
          tracking: f.tracking,
        })),
        order_status_page: order.status_page_url,
      },
    },
  };
}
