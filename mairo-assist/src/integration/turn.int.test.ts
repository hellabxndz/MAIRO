import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FALLBACK_REPLY, LIMIT_REPLY, runTurn } from "@/lib/ai/turn";
import { reindexDocument } from "@/lib/knowledge/service";
import { createAdminClient } from "@/lib/supabase/admin";

/*
 * Live-mode AI turns against real Postgres/PostgREST and the fake OpenAI
 * server. Requires the e2e stack env (run via `npm run test:e2e`).
 */

const admin = createAdminClient();
const FAKE = process.env.E2E_FAKE_OPENAI!;
const setMode = (mode: "up" | "down") => fetch(`${FAKE}/__mode`, { method: "POST", body: JSON.stringify({ mode }) });

async function makeBusiness(name: string, policy: string) {
  const id = randomUUID();
  await must(admin.from("businesses").insert({ id, name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${id.slice(0, 6)}`, ai_goals: ["customer_support", "lead_collection"] }));
  await must(admin.from("business_settings").insert({ business_id: id, onboarding_step: 9, support_email: "help@example.com" }));
  // New businesses start on Free (trigger); these tests use Growth features like hand-off.
  await must(admin.from("subscriptions").update({ plan_key: "growth", provider: "manual" }).eq("business_id", id));
  const employeeId = randomUUID();
  await must(admin.from("ai_employees").insert({ id: employeeId, business_id: id, name: "Nova", draft_config: {} }));
  const versionId = randomUUID();
  await must(admin.from("ai_employee_versions").insert({ id: versionId, business_id: id, ai_employee_id: employeeId, version: 1, name: "Nova", config: { personality: "friendly" } }));
  await must(admin.from("ai_employees").update({ published_version_id: versionId, tested_at: new Date().toISOString(), status: "active" }).eq("id", employeeId));
  const doc = await must<{ id: string }>(admin.from("knowledge_documents").insert({ business_id: id, title: "Return policy", category: "return_policy", source_type: "manual", content: policy }).select("id").single());
  await reindexDocument(id, doc.id, policy);
  return { id, employeeId };
}

async function must<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}

async function newConversation(businessId: string) {
  const row = await must<{ id: string }>(admin.from("conversations").insert({ business_id: businessId, channel: "widget" }).select("id").single());
  return row.id;
}

const messagesOf = async (conversationId: string) =>
  must(admin.from("conversation_messages").select("sender_type, content, sources, tool_names").eq("conversation_id", conversationId).order("created_at"));
const conversationOf = async (id: string) => must(admin.from("conversations").select("status, handled_by, message_count").eq("id", id).single());

let a: { id: string; employeeId: string };
let b: { id: string; employeeId: string };

beforeAll(async () => {
  await setMode("up");
  a = await makeBusiness("Alpha Denim", "Returns are accepted within 30 days of delivery.");
  b = await makeBusiness("Beta Boots", "Returns are accepted within 90 days, no questions asked.");
});
afterAll(async () => {
  await setMode("up");
  await admin.from("businesses").delete().in("id", [a.id, b.id]);
});

describe("live AI turns", () => {
  it("answers from this business's knowledge only, with sources, usage and audit", async () => {
    const conv = await newConversation(a.id);
    const r = await runTurn({ businessId: a.id, conversationId: conv, mode: "live", customerText: "What's your return policy?" });
    expect(r.status).toBe("replied");
    const msgs = await messagesOf(conv);
    expect(msgs.map((m) => m.sender_type)).toEqual(["customer", "ai"]);
    expect(msgs[1].content).toContain("30 days");
    expect(msgs[1].content).not.toContain("90 days");
    expect(msgs[1].sources).toEqual([expect.objectContaining({ title: "Return policy", category: "return_policy" })]);
    expect(msgs[1].tool_names).toEqual(["search_knowledge"]);
    expect(await conversationOf(conv)).toMatchObject({ status: "ai_handling", handled_by: "ai", message_count: 2 });

    const usage = await must(admin.from("usage_records").select("kind, model, input_tokens, cached_input_tokens, output_tokens, estimated_cost_usd").eq("conversation_id", conv));
    expect(usage).toHaveLength(2);
    // (1000 uncached × $1 + 200 cached × $0.50 + 60 output × $4) / 1M
    expect(Number(usage[0].estimated_cost_usd)).toBeCloseTo(0.00134, 6);
    expect(usage[0]).toMatchObject({ kind: "chat_completion", model: "fake-model", input_tokens: 1200, cached_input_tokens: 200, output_tokens: 60 });

    const audit = await must(admin.from("ai_tool_executions").select("tool_name, status, business_id").eq("conversation_id", conv));
    expect(audit).toEqual([{ tool_name: "search_knowledge", status: "success", business_id: a.id }]);
  });

  it("sends the safety rules and only this business's tools to the model", async () => {
    const reqs = (await (await fetch(`${FAKE}/__requests`)).json()) as { auth: string; body: { instructions: string; tools: { name: string; strict: boolean }[]; store: boolean } }[];
    const last = reqs.filter((r) => r.body.instructions.includes("Alpha Denim")).at(-1)!;
    expect(last.auth).toBe("Bearer e2e-fake-key");
    expect(last.body.store).toBe(false);
    expect(last.body.instructions).toMatch(/Never invent products/);
    expect(last.body.instructions).not.toContain("Beta Boots");
    expect(last.body.tools.map((t) => t.name).sort()).toEqual(["capture_lead", "escalate_to_human", "get_business_policy", "search_knowledge"].sort());
    expect(last.body.tools.every((t) => t.strict)).toBe(true);
  });

  it("stays silent while paused", async () => {
    await must(admin.from("ai_employees").update({ status: "paused" }).eq("id", a.employeeId));
    const conv = await newConversation(a.id);
    const r = await runTurn({ businessId: a.id, conversationId: conv, mode: "live", customerText: "Hello?" });
    expect(r).toMatchObject({ status: "skipped", reason: "paused" });
    expect((await messagesOf(conv)).map((m) => m.sender_type)).toEqual(["customer"]);
    await must(admin.from("ai_employees").update({ status: "active" }).eq("id", a.employeeId));
  });

  it("escalates to a person, then stops replying", async () => {
    const conv = await newConversation(a.id);
    const r = await runTurn({ businessId: a.id, conversationId: conv, mode: "live", customerText: "I need to speak to a real person." });
    expect(r.status).toBe("replied");
    expect(await conversationOf(conv)).toMatchObject({ status: "needs_attention", handled_by: "human" });
    const tickets = await must(admin.from("support_tickets").select("type, priority, created_by_type").eq("conversation_id", conv));
    expect(tickets).toEqual([{ type: "escalation", priority: "high", created_by_type: "ai" }]);
    const events = await must(admin.from("analytics_events").select("event_type").eq("conversation_id", conv));
    expect(events.map((e) => e.event_type)).toContain("conversation_escalated");

    const again = await runTurn({ businessId: a.id, conversationId: conv, mode: "live", customerText: "Hello? Anyone?" });
    expect(again).toMatchObject({ status: "skipped", reason: "human_handling" });
    expect((await messagesOf(conv)).filter((m) => m.sender_type === "ai")).toHaveLength(1);
  });

  it("captures a lead only when asked, and keeps emails out of the audit log", async () => {
    const conv = await newConversation(a.id);
    await runTurn({ businessId: a.id, conversationId: conv, mode: "live", customerText: "Please contact me at jane.doe@example.com when the black jeans are back" });
    const leads = await must(admin.from("leads").select("email, source, business_id").eq("conversation_id", conv));
    expect(leads).toEqual([{ email: "jane.doe@example.com", source: "chat", business_id: a.id }]);
    const audit = await must(admin.from("ai_tool_executions").select("input").eq("conversation_id", conv).eq("tool_name", "capture_lead"));
    expect(JSON.stringify(audit)).not.toContain("jane.doe@example.com");
    expect(JSON.stringify(audit)).toContain("[email]");
  });

  it("falls back honestly when the AI provider is down", async () => {
    await setMode("down");
    const conv = await newConversation(a.id);
    const r = await runTurn({ businessId: a.id, conversationId: conv, mode: "live", customerText: "Do you ship to Canada?" });
    await setMode("up");
    expect(r.status).toBe("fallback");
    const msgs = await messagesOf(conv);
    expect(msgs.at(-1)).toMatchObject({ sender_type: "ai", content: FALLBACK_REPLY });
    expect(await conversationOf(conv)).toMatchObject({ status: "needs_attention" });
  });

  it("hands over to the team when the monthly allowance is used up", async () => {
    const period = new Date().toISOString().slice(0, 8) + "01";
    await must(admin.from("usage_counters").upsert({ business_id: b.id, period_start: period, model_requests: 1_000_000 }));
    const conv = await newConversation(b.id);
    const r = await runTurn({ businessId: b.id, conversationId: conv, mode: "live", customerText: "Hi" });
    expect(r).toMatchObject({ status: "fallback", reason: "usage_limit" });
    expect((await messagesOf(conv)).at(-1)?.content).toBe(LIMIT_REPLY);
    expect(await conversationOf(conv)).toMatchObject({ handled_by: "human", status: "needs_attention" });
  });

  it("uses one credit per live AI reply", async () => {
    const period = new Date().toISOString().slice(0, 8) + "01";
    const before = (await admin.from("usage_counters").select("ai_responses").eq("business_id", a.id).eq("period_start", period).maybeSingle()).data?.ai_responses ?? 0;
    const conv = await newConversation(a.id);
    const r = await runTurn({ businessId: a.id, conversationId: conv, mode: "live", customerText: "Hello there" });
    expect(r.status).toBe("replied");
    const after = (await admin.from("usage_counters").select("ai_responses").eq("business_id", a.id).eq("period_start", period).single()).data!.ai_responses;
    expect(after).toBe(before + 1);
  });

  it("a Free business gets 100 responses a month, then hands over to the team", async () => {
    const period = new Date().toISOString().slice(0, 8) + "01";
    const c = await makeBusiness("Gamma Free", "Returns within 14 days.");
    await must(admin.from("subscriptions").update({ plan_key: "free", provider: "none" }).eq("business_id", c.id));
    await must(admin.from("usage_counters").upsert({ business_id: c.id, period_start: period, ai_responses: 99 }));
    const first = await runTurn({ businessId: c.id, conversationId: await newConversation(c.id), mode: "live", customerText: "Hi" });
    expect(first.status).toBe("replied");
    const conv = await newConversation(c.id);
    const second = await runTurn({ businessId: c.id, conversationId: conv, mode: "live", customerText: "Hi again" });
    expect(second).toMatchObject({ status: "fallback", reason: "usage_limit" });
    expect(await conversationOf(conv)).toMatchObject({ handled_by: "human" });
    await admin.from("businesses").delete().eq("id", c.id);
  });

  it("refuses conversations from another business or the wrong channel", async () => {
    const convB = await newConversation(b.id);
    expect(await runTurn({ businessId: a.id, conversationId: convB, mode: "live", customerText: "hi" })).toMatchObject({ status: "rejected", reason: "not_found" });
    expect((await messagesOf(convB))).toHaveLength(0);
    const convA = await newConversation(a.id);
    expect(await runTurn({ businessId: a.id, conversationId: convA, mode: "preview", customerText: "hi" })).toMatchObject({ status: "rejected", reason: "not_found" });
  });

  it("rejects empty and oversized messages without calling the model", async () => {
    const conv = await newConversation(a.id);
    expect(await runTurn({ businessId: a.id, conversationId: conv, mode: "live", customerText: "   " })).toMatchObject({ status: "rejected", reason: "empty" });
    expect(await runTurn({ businessId: a.id, conversationId: conv, mode: "live", customerText: "x".repeat(2001) })).toMatchObject({ status: "rejected", reason: "too_long" });
    expect(await messagesOf(conv)).toHaveLength(0);
  });
});
