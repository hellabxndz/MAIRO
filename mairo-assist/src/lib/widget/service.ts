import "server-only";
import { type NextRequest } from "next/server";
import { credentials, isShopifyConfigured } from "@/lib/shopify/config";
import { isFreshTimestamp, normalizeShopDomain } from "@/lib/shopify/oauth";
import { sha256Hex } from "@/lib/security/tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseAiConfig } from "@/lib/validation/ai-employee";
import { verifyProxySignature } from "./proxy";

export type StorefrontContext = { businessId: string; shop: string; loggedInCustomerId: string | null };

/**
 * Who is calling: verified from Shopify's App Proxy signature, never from
 * anything the browser claims. Only a live (active) store connection counts.
 */
export async function storefrontContext(request: NextRequest): Promise<StorefrontContext | null> {
  if (!isShopifyConfigured()) return null;
  const params = request.nextUrl.searchParams;
  if (!verifyProxySignature(params, credentials().clientSecret)) return null;
  if (!isFreshTimestamp(params.get("timestamp"))) return null;
  const shop = normalizeShopDomain(params.get("shop"));
  if (!shop) return null;
  const { data: conn } = await createAdminClient()
    .from("shopify_connections")
    .select("business_id")
    .eq("shop_domain", shop)
    .eq("status", "active")
    .maybeSingle();
  if (!conn) return null;
  const customer = params.get("logged_in_customer_id");
  return { businessId: conn.business_id as string, shop, loggedInCustomerId: customer && /^\d+$/.test(customer) ? customer : null };
}

/** The per-browser secret the widget keeps in localStorage; only its hash is stored. */
export function visitorHash(secret: unknown): string | null {
  if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{24,100}$/.test(secret)) return null;
  return sha256Hex(`visitor:${secret}`);
}

/** Public widget settings. The widget only shows while the AI employee is live. */
export async function widgetConfig(businessId: string) {
  const admin = createAdminClient();
  const [{ data: business }, { data: employee }] = await Promise.all([
    admin.from("businesses").select("name, status").eq("id", businessId).single(),
    admin
      .from("ai_employees")
      .select("status, published:ai_employee_versions!ai_employees_published_version_fk(config, name)")
      .eq("business_id", businessId)
      .maybeSingle(),
  ]);
  const published = (Array.isArray(employee?.published) ? employee?.published[0] : employee?.published) as { config: unknown; name: string } | null;
  if (!business || business.status === "suspended" || !employee || employee.status !== "active" || !published) return { enabled: false as const };
  const config = parseAiConfig(published.config);
  return {
    enabled: true as const,
    name: published.name,
    businessName: business.name as string,
    welcomeMessage: config.welcomeMessage,
    brandColor: config.brandColor,
    position: config.bubblePosition,
  };
}

export async function findConversation(businessId: string, conversationId: unknown, visitor: string) {
  if (typeof conversationId !== "string" || !/^[0-9a-f-]{36}$/.test(conversationId)) return null;
  const { data } = await createAdminClient()
    .from("conversations")
    .select("id, handled_by, status")
    .eq("id", conversationId)
    .eq("business_id", businessId)
    .eq("channel", "widget")
    .eq("visitor_id", visitor)
    .maybeSingle();
  return data;
}

export type WidgetMessage = { id: string; from: "customer" | "ai" | "team" | "system"; text: string; cards: unknown[]; at: string };

/** Messages as the customer sees them (no internal sources, tools or staff names). */
export async function widgetMessages(conversationId: string) {
  const admin = createAdminClient();
  const [{ data: rows }, { data: conv }] = await Promise.all([
    admin.from("conversation_messages").select("id, sender_type, content, attachments, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(100),
    admin.from("conversations").select("handled_by, status").eq("id", conversationId).single(),
  ]);
  const messages: WidgetMessage[] = (rows ?? []).reverse().map((m) => ({
    id: m.id,
    from: m.sender_type === "human" ? "team" : (m.sender_type as WidgetMessage["from"]),
    text: m.content,
    cards: Array.isArray(m.attachments) ? m.attachments : [],
    at: m.created_at,
  }));
  const last = messages.at(-1);
  // The AI is working on a reply: the customer spoke last, recently, and the AI still owns the chat.
  const typing = Boolean(last && last.from === "customer" && conv?.handled_by === "ai" && Date.now() - Date.parse(last.at) < 90_000);
  return { messages, typing, withTeam: conv?.handled_by === "human" };
}
