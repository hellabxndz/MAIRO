import { describe, expect, it, vi } from "vitest";
import { runAgent, type ToolOutcome } from "./agent";
import { definitionOf, parseArguments, toToolParameters } from "./tool-spec";
import { ALL_TOOLS, captureLead, searchKnowledge } from "./tools";
import type { AiProvider, ProviderResponse } from "./types";

function scripted(responses: Partial<ProviderResponse>[]) {
  const calls: Parameters<AiProvider["respond"]>[0][] = [];
  const provider: AiProvider = {
    model: "test-model",
    respond: async (req) => {
      calls.push(structuredClone(req));
      const r = responses.shift() ?? { text: "done" };
      return { text: r.text ?? "", functionCalls: r.functionCalls ?? [], usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 } };
    },
  };
  return { provider, calls };
}

const tools = [searchKnowledge].map(definitionOf);
const ok = (output: unknown): ToolOutcome => ({ status: "success", output, sources: [{ id: "d1", title: "Return policy", category: "return_policy" }] });

describe("agent loop", () => {
  it("answers directly when no tool is needed", async () => {
    const { provider } = scripted([{ text: " Hi there! " }]);
    const r = await runAgent({ provider, instructions: "x", history: [{ type: "message", role: "user", content: "hi" }], tools, execute: vi.fn() });
    expect(r.text).toBe("Hi there!");
    expect(r.toolCalls).toEqual([]);
    expect(r.usage).toHaveLength(1);
  });

  it("runs requested tools and feeds results back", async () => {
    const { provider, calls } = scripted([
      { functionCalls: [{ callId: "c1", name: "search_knowledge", arguments: '{"query":"returns"}' }] },
      { text: "You have 30 days." },
    ]);
    const execute = vi.fn(async () => ok({ results: [{ text: "30 days" }] }));
    const r = await runAgent({ provider, instructions: "x", history: [{ type: "message", role: "user", content: "returns?" }], tools, execute });
    expect(execute).toHaveBeenCalledWith("search_knowledge", '{"query":"returns"}');
    expect(r.text).toBe("You have 30 days.");
    expect(r.sources).toEqual([{ id: "d1", title: "Return policy", category: "return_policy" }]);
    const second = calls[1].input;
    expect(second.at(-2)).toMatchObject({ type: "function_call", callId: "c1" });
    expect(second.at(-1)).toMatchObject({ type: "function_call_output", callId: "c1" });
  });

  it("refuses tools that weren't offered, without executing them", async () => {
    const { provider, calls } = scripted([
      { functionCalls: [{ callId: "c1", name: "issue_refund", arguments: "{}" }] },
      { text: "I can't do that, but I can pass it to the team." },
    ]);
    const execute = vi.fn();
    const r = await runAgent({ provider, instructions: "x", history: [], tools, execute });
    expect(execute).not.toHaveBeenCalled();
    expect(r.toolCalls).toEqual([{ name: "issue_refund", status: "denied" }]);
    expect(JSON.parse((calls[1].input.at(-1) as { output: string }).output).error).toMatch(/not available/);
  });

  it("reports tool crashes to the model as failures", async () => {
    const { provider, calls } = scripted([{ functionCalls: [{ callId: "c1", name: "search_knowledge", arguments: '{"query":"x"}' }] }, { text: "Sorry." }]);
    const r = await runAgent({ provider, instructions: "x", history: [], tools, execute: async () => { throw new Error("db down"); } });
    expect(r.toolCalls[0].status).toBe("error");
    expect((calls[1].input.at(-1) as { output: string }).output).toMatch(/Do not claim it succeeded/);
  });

  it("stops looping: the final round withdraws tools", async () => {
    const loop = { functionCalls: [{ callId: "c", name: "search_knowledge", arguments: '{"query":"x"}' }], text: "best effort" };
    const { provider, calls } = scripted([loop, loop, loop]);
    const r = await runAgent({ provider, instructions: "x", history: [], tools, execute: async () => ok({}), maxRounds: 2 });
    expect(calls).toHaveLength(3);
    expect(calls[2].tools).toEqual([]);
    expect(r.text).toBe("best effort");
  });

  it("propagates provider failures so callers can fall back", async () => {
    const provider: AiProvider = { model: "m", respond: async () => { throw new Error("503"); } };
    await expect(runAgent({ provider, instructions: "x", history: [], tools, execute: vi.fn() })).rejects.toThrow("503");
  });
});

describe("tool schemas", () => {
  it("are strict objects the provider accepts", () => {
    for (const t of ALL_TOOLS) {
      const p = toToolParameters(t.schema);
      expect(p.type).toBe("object");
      expect(p.additionalProperties).toBe(false);
      expect(p.required).toEqual(Object.keys(p.properties as object));
      expect(JSON.stringify(p)).not.toMatch(/maxLength|\$schema|"format"/);
    }
  });

  it("validates model arguments server-side", () => {
    expect(parseArguments(searchKnowledge, '{"query":"returns"}').ok).toBe(true);
    expect(parseArguments(searchKnowledge, '{"query":"x".repeat}').ok).toBe(false);
    expect(parseArguments(searchKnowledge, `{"query":"${"a".repeat(201)}"}`).ok).toBe(false);
    expect(parseArguments(searchKnowledge, '{"query":"ok","business_id":"other"}').ok).toBe(false);
    expect(parseArguments(captureLead, '{"email":"not-an-email","name":null,"interest":"x"}').ok).toBe(false);
  });
});
