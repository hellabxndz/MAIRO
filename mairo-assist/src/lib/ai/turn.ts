import "server-only";
import { recordActivity } from "@/lib/audit";
import { entitledPlan, PLANS, usageStatus, type Plan } from "@/lib/billing/plans";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { billingIsEnforced } from "@/lib/tenancy/context";
import { parseAiConfig, type AiEmployeeConfig } from "@/lib/validation/ai-employee";
import { runAgent } from "./agent";
import { estimateCostUsd, getProvider, LIMITS } from "./config";
import { buildInstructions } from "./prompt";
import { definitionOf } from "./tool-spec";
import { enabledSpecs, executeTool } from "./tools-server";
import type { AgentItem, AiProvider } from "./types";

export type StoredMessage = {
  id: string;
  sender_type: "customer" | "ai" | "human" | "system";
  content: string;
  sources: { id: string; title: string; category: string }[];
  tool_names: string[];
  created_at: string;
};

export type TurnResult =
  | { status: "replied"; customer: StoredMessage; reply: StoredMessage }
  | { status: "fallback"; customer: StoredMessage; reply: StoredMessage; reason: string }
  | { status: "skipped"; customer: StoredMessage | null; reason: "human_handling" | "paused" | "resolved" }
  | { status: "rejected"; reason: "empty" | "too_long" | "rate_limited" | "not_found" | "not_configured" | "provider_unavailable"; message: string };

export const FALLBACK_REPLY =
  "Sorry — I'm having trouble answering right now. I've let the team know, and someone will get back to you here.";
export const LIMIT_REPLY = "Thanks for your patience — I'm passing this conversation to the team, and a person will reply here.";

const MESSAGE_COLUMNS = "id, sender_type, content, sources, tool_names, created_at";

type AiContext = {
  business: { id: string; name: string; description: string | null; website_url: string | null; ai_goals: string[] };
  employee: { id: string; name: string; status: string; config: AiEmployeeConfig };
  supportEmail: string | null;
  plan: Plan | null;
  storeConnected: boolean;
};

async function loadContext(businessId: string, mode: "live" | "preview"): Promise<AiContext | null> {
  const admin = createAdminClient();
  const [{ data: business }, { data: employee }, { data: settings }, { data: sub }, { data: shop }] = await Promise.all([
    admin.from("businesses").select("id, name, description, website_url, ai_goals, status").eq("id", businessId).single(),
    admin
      .from("ai_employees")
      .select("id, name, status, draft_config, published:ai_employee_versions!ai_employees_published_version_fk(config, name)")
      .eq("business_id", businessId)
      .maybeSingle(),
    admin.from("business_settings").select("support_email").eq("business_id", businessId).single(),
    admin.from("subscriptions").select("plan_key, status").eq("business_id", businessId).maybeSingle(),
    admin.from("shopify_connections").select("id").eq("business_id", businessId).eq("status", "active").maybeSingle(),
  ]);
  if (!business || business.status === "suspended" || !employee) return null;

  const published = (Array.isArray(employee.published) ? employee.published[0] : employee.published) as { config: unknown; name: string } | null;
  // Customers talk to the published version; the preview tests the draft.
  const config = parseAiConfig(mode === "live" ? published?.config : employee.draft_config);
  return {
    business,
    employee: { id: employee.id, name: mode === "live" && published ? published.name : employee.name, status: employee.status, config },
    supportEmail: settings?.support_email ?? null,
    plan: billingIsEnforced() ? entitledPlan(sub) : PLANS.pro,
    storeConnected: Boolean(shop),
  };
}

export function enabledToolNames(ctx: Pick<AiContext, "plan" | "business" | "employee">): Set<string> {
  const enabled = new Set<string>(["search_knowledge", "get_business_policy"]);
  const esc = ctx.employee.config.escalation;
  if (ctx.plan?.features.includes("human_escalation") && (esc.escalateOnRequest || esc.offerHumanWhenUpset)) enabled.add("escalate_to_human");
  if (ctx.business.ai_goals.includes("lead_collection")) enabled.add("capture_lead");
  return enabled;
}

function periodStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

async function insertMessage(row: {
  business_id: string;
  conversation_id: string;
  sender_type: StoredMessage["sender_type"];
  content: string;
  sources?: StoredMessage["sources"];
  tool_names?: string[];
}): Promise<StoredMessage> {
  const { data, error } = await createAdminClient().from("conversation_messages").insert(row).select(MESSAGE_COLUMNS).single();
  if (error || !data) throw new Error("Could not save message");
  return data as StoredMessage;
}

function toHistory(messages: { sender_type: string; content: string }[]): AgentItem[] {
  return messages.flatMap((m): AgentItem[] => {
    if (m.sender_type === "customer") return [{ type: "message", role: "user", content: m.content }];
    if (m.sender_type === "ai") return [{ type: "message", role: "assistant", content: m.content }];
    if (m.sender_type === "human") return [{ type: "message", role: "assistant", content: `[Reply from a person on the team] ${m.content}` }];
    return [];
  });
}

/**
 * One customer message → at most one AI reply. Handles every refusal case
 * (human took over, AI paused, allowance used up, provider down) without ever
 * inventing an answer.
 */
export async function runTurn(opts: {
  businessId: string;
  conversationId: string;
  mode: "live" | "preview";
  customerText: string;
  provider?: AiProvider | null;
}): Promise<TurnResult> {
  const text = opts.customerText.trim();
  if (!text) return { status: "rejected", reason: "empty", message: "Type a message first." };
  if (text.length > LIMITS.maxCustomerMessageChars) return { status: "rejected", reason: "too_long", message: "That message is too long." };

  const admin = createAdminClient();
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, business_id, status, handled_by, channel, message_count")
    .eq("id", opts.conversationId)
    .eq("business_id", opts.businessId)
    .maybeSingle();
  if (!conversation || (opts.mode === "preview") !== (conversation.channel === "preview")) {
    return { status: "rejected", reason: "not_found", message: "Conversation not found." };
  }

  if (opts.mode === "preview" && !(await rateLimit(`preview:${opts.businessId}`, LIMITS.previewPerHour, 3600))) {
    return { status: "rejected", reason: "rate_limited", message: "You've sent a lot of test messages. Try again in a little while." };
  }

  const provider = opts.provider === undefined ? getProvider() : opts.provider;
  if (opts.mode === "preview" && !provider) {
    return { status: "rejected", reason: "not_configured", message: "The AI engine isn't configured on this deployment yet (OPENAI_API_KEY and OPENAI_MODEL)." };
  }

  const ctx = await loadContext(opts.businessId, opts.mode);
  if (!ctx) return { status: "rejected", reason: "not_found", message: "Set up your AI employee first." };

  const customer = await insertMessage({ business_id: opts.businessId, conversation_id: opts.conversationId, sender_type: "customer", content: text });

  // A person owns this conversation: the AI stays silent.
  if (conversation.handled_by === "human") return { status: "skipped", customer, reason: "human_handling" };
  if (opts.mode === "live" && ctx.employee.status !== "active") return { status: "skipped", customer, reason: "paused" };
  if (opts.mode === "live" && conversation.status === "resolved") {
    await admin.from("conversations").update({ status: "ai_handling", resolved_at: null }).eq("id", conversation.id);
  }

  // Allowance and per-conversation caps (live only).
  if (opts.mode === "live") {
    const over = await overAllowance(ctx, opts.businessId);
    if (over || conversation.message_count >= LIMITS.maxMessagesPerConversation) {
      return handOff(opts.businessId, opts.conversationId, customer, over ? "usage_limit" : "conversation_length");
    }
  }

  if (!provider) return handOff(opts.businessId, opts.conversationId, customer, "not_configured", FALLBACK_REPLY);

  const { data: recent } = await admin
    .from("conversation_messages")
    .select("sender_type, content, created_at")
    .eq("conversation_id", opts.conversationId)
    .order("created_at", { ascending: false })
    .limit(LIMITS.historyMessages);
  const history = toHistory((recent ?? []).reverse());

  const enabled = enabledToolNames(ctx);
  const instructions = buildInstructions({
    aiName: ctx.employee.name,
    business: { name: ctx.business.name, description: ctx.business.description, websiteUrl: ctx.business.website_url },
    config: ctx.employee.config,
    goals: ctx.business.ai_goals,
    capabilities: {
      knowledge: true,
      escalation: enabled.has("escalate_to_human"),
      leadCapture: enabled.has("capture_lead"),
      storeConnected: ctx.storeConnected,
    },
    supportEmail: ctx.supportEmail,
    mode: opts.mode,
  });

  try {
    const result = await runAgent({
      provider,
      instructions,
      history,
      tools: enabledSpecs(enabled).map(definitionOf),
      execute: (name, args) => executeTool({ businessId: opts.businessId, conversationId: opts.conversationId, mode: opts.mode, enabled }, name, args),
      safetyIdentifier: `biz_${opts.businessId.slice(0, 8)}`,
    });

    const period = periodStart();
    for (const u of result.usage) {
      await admin.rpc("record_ai_usage", {
        p_business_id: opts.businessId,
        p_conversation_id: opts.conversationId,
        p_kind: opts.mode === "preview" ? "preview" : "chat_completion",
        p_model: provider.model,
        p_input_tokens: u.inputTokens,
        p_cached_input_tokens: u.cachedInputTokens,
        p_output_tokens: u.outputTokens,
        p_estimated_cost_usd: estimateCostUsd(u),
        p_period_start: period,
        p_provider_request_id: u.requestId ?? null,
      });
    }

    if (!result.text) throw new Error("Empty reply from provider");
    const reply = await insertMessage({
      business_id: opts.businessId,
      conversation_id: opts.conversationId,
      sender_type: "ai",
      content: result.text.slice(0, 8000),
      sources: result.sources,
      tool_names: result.toolCalls.map((t) => t.name),
    });

    if (opts.mode === "preview") {
      await admin.from("ai_employees").update({ tested_at: new Date().toISOString() }).eq("id", ctx.employee.id).eq("business_id", opts.businessId);
    }
    return { status: "replied", customer, reply };
  } catch (e) {
    log.error("ai.turn_failed", { businessId: opts.businessId, mode: opts.mode, error: e instanceof Error ? e : String(e) });
    if (opts.mode === "preview") {
      return { status: "rejected", reason: "provider_unavailable", message: "The AI provider didn't respond. Your message was saved — try again in a moment." };
    }
    const reply = await insertMessage({ business_id: opts.businessId, conversation_id: opts.conversationId, sender_type: "ai", content: FALLBACK_REPLY });
    await admin.from("conversations").update({ status: "needs_attention" }).eq("id", opts.conversationId).eq("business_id", opts.businessId);
    await recordActivity({ businessId: opts.businessId, type: "ai_unavailable", summary: "The AI couldn't answer a customer; the conversation needs your attention.", conversationId: opts.conversationId });
    return { status: "fallback", customer, reply, reason: "provider_unavailable" };
  }
}

async function overAllowance(ctx: AiContext, businessId: string) {
  if (!ctx.plan) return true;
  const admin = createAdminClient();
  const period = periodStart();
  const { data: usage } = await admin
    .from("usage_counters")
    .select("conversations, model_requests, limit_warning_sent_at")
    .eq("business_id", businessId)
    .eq("period_start", period)
    .maybeSingle();
  const status = usageStatus(ctx.plan, { conversations: usage?.conversations ?? 0, aiRequests: usage?.model_requests ?? 0 });
  if (status.warning && !usage?.limit_warning_sent_at) {
    await admin.from("usage_counters").update({ limit_warning_sent_at: new Date().toISOString() }).eq("business_id", businessId).eq("period_start", period);
    await recordActivity({ businessId, type: "usage_warning", summary: `Your AI employee has used ${Math.round(status.ratio * 100)}% of this month's allowance.` });
  }
  return status.exceeded && status.behavior === "handoff_to_human";
}

async function handOff(businessId: string, conversationId: string, customer: StoredMessage, reason: string, text = LIMIT_REPLY): Promise<TurnResult> {
  const admin = createAdminClient();
  const reply = await insertMessage({ business_id: businessId, conversation_id: conversationId, sender_type: "ai", content: text });
  await admin.from("conversations").update({ handled_by: "human", status: "needs_attention" }).eq("id", conversationId).eq("business_id", businessId);
  await recordActivity({ businessId, type: "ai_handoff", summary: reason === "usage_limit" ? "AI allowance reached — a conversation was handed to your team." : "A conversation was handed to your team.", conversationId });
  return { status: "fallback", customer, reply, reason };
}
