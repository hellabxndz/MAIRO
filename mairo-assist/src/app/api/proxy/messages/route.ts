import { after, NextResponse, type NextRequest } from "next/server";
import { runTurn } from "@/lib/ai/turn";
import { LIMITS } from "@/lib/ai/config";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { findConversation, storefrontContext, visitorHash, widgetConfig, widgetMessages } from "@/lib/widget/service";

export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Poll a conversation: messages, whether the AI is typing, and whether the team has taken over. */
export async function GET(request: NextRequest) {
  const ctx = await storefrontContext(request);
  if (!ctx) return json({ error: "unauthorized" }, 401);
  const visitor = visitorHash(request.nextUrl.searchParams.get("visitor"));
  if (!visitor) return json({ error: "invalid_visitor" }, 400);
  if (!(await rateLimit(`widget-poll:${visitor}`, 120, 60))) return json({ error: "rate_limited" }, 429);
  const conv = await findConversation(ctx.businessId, request.nextUrl.searchParams.get("conversation"), visitor);
  if (!conv) return json({ messages: [], typing: false, withTeam: false });
  return json({ conversationId: conv.id, ...(await widgetMessages(conv.id)) });
}

/**
 * A customer message. It's saved straight away and the reply is written in
 * the background, so the storefront isn't kept waiting on the AI; the widget
 * polls for it (and for replies from the team).
 */
export async function POST(request: NextRequest) {
  const ctx = await storefrontContext(request);
  if (!ctx) return json({ error: "unauthorized" }, 401);
  let body: { visitor?: unknown; conversation?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const visitor = visitorHash(body.visitor);
  if (!visitor) return json({ error: "invalid_visitor" }, 400);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return json({ error: "empty" }, 400);
  if (text.length > LIMITS.maxCustomerMessageChars) return json({ error: "too_long", message: "That message is too long." }, 400);

  // Abuse limits: per browser, and per store overall (credits are the real cap).
  const allowed = (await rateLimit(`widget:${visitor}`, 20, 600)) && (await rateLimit(`widget-shop:${ctx.businessId}`, 600, 3600));
  if (!allowed) return json({ error: "rate_limited", message: "You're sending messages very quickly. Please wait a moment." }, 429);

  const config = await widgetConfig(ctx.businessId);
  if (!config.enabled) return json({ error: "offline", message: "Chat is offline right now." }, 503);

  const admin = createAdminClient();
  let conv = await findConversation(ctx.businessId, body.conversation, visitor);
  if (!conv) {
    const { data, error } = await admin
      .from("conversations")
      .insert({ business_id: ctx.businessId, channel: "widget", visitor_id: visitor, subject: text.slice(0, 120) })
      .select("id, handled_by, status")
      .single();
    if (error || !data) return json({ error: "unavailable" }, 500);
    conv = data;
    await admin.from("analytics_events").insert({ business_id: ctx.businessId, event_type: "conversation_started", conversation_id: data.id });
  }

  const { data: saved, error } = await admin
    .from("conversation_messages")
    .insert({ business_id: ctx.businessId, conversation_id: conv.id, sender_type: "customer", content: text })
    .select("id")
    .single();
  if (error || !saved) return json({ error: "unavailable" }, 500);

  const conversationId = conv.id as string;
  after(async () => {
    try {
      await runTurn({ businessId: ctx.businessId, conversationId, mode: "live", customerText: text, savedMessageId: saved.id });
    } catch (e) {
      log.error("widget.turn_failed", { error: e instanceof Error ? e.message : String(e) });
    }
  });
  return json({ conversationId, messageId: saved.id });
}
