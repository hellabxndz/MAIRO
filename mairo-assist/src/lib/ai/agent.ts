import type { AiProvider, AgentItem, ProviderUsage, ToolDefinition } from "./types";

export type ToolOutcome = {
  /** What the model sees (JSON-serialisable). Never contains secrets. */
  output: unknown;
  status: "success" | "denied" | "invalid_input" | "error";
  sources?: { id: string; title: string; category: string }[];
  /** Products to show the customer as cards next to the reply. */
  cards?: ProductCard[];
};

export type ProductCard = { type: "product"; id: string; title: string; price: string | null; url: string | null; image: string | null };

export type AgentResult = {
  text: string;
  toolCalls: { name: string; status: ToolOutcome["status"] }[];
  sources: { id: string; title: string; category: string }[];
  cards: ProductCard[];
  usage: ProviderUsage[];
};

const MAX_TOOL_CALLS_PER_TURN = 8;
const MAX_CARDS = 4;

/**
 * The agent loop: ask the model, run any tools it requests (through the
 * executor, which enforces authorization), feed results back, repeat until it
 * answers in text. The model can only *request* tools; `execute` decides.
 */
export async function runAgent(opts: {
  provider: AiProvider;
  instructions: string;
  history: AgentItem[];
  tools: ToolDefinition[];
  execute: (name: string, rawArguments: string) => Promise<ToolOutcome>;
  maxRounds?: number;
  maxOutputTokens?: number;
  safetyIdentifier?: string;
}): Promise<AgentResult> {
  const input: AgentItem[] = [...opts.history];
  const toolCalls: AgentResult["toolCalls"] = [];
  const sources = new Map<string, { id: string; title: string; category: string }>();
  const cards = new Map<string, ProductCard>();
  const usage: ProviderUsage[] = [];
  const maxRounds = opts.maxRounds ?? 4;

  for (let round = 0; round <= maxRounds; round++) {
    const lastRound = round === maxRounds || toolCalls.length >= MAX_TOOL_CALLS_PER_TURN;
    const response = await opts.provider.respond({
      instructions: opts.instructions,
      input,
      // On the last round tools are withdrawn so the model must answer.
      tools: lastRound ? [] : opts.tools,
      maxOutputTokens: opts.maxOutputTokens ?? 700,
      safetyIdentifier: opts.safetyIdentifier,
    });
    usage.push(response.usage);

    if (response.functionCalls.length === 0 || lastRound) {
      return { text: response.text.trim(), toolCalls, sources: [...sources.values()], cards: [...cards.values()], usage };
    }

    for (const call of response.functionCalls) {
      input.push({ type: "function_call", callId: call.callId, name: call.name, arguments: call.arguments });
      let outcome: ToolOutcome;
      if (toolCalls.length >= MAX_TOOL_CALLS_PER_TURN) {
        outcome = { status: "denied", output: { error: "Too many tool calls in one reply. Answer with what you have." } };
      } else if (!opts.tools.some((t) => t.name === call.name)) {
        outcome = { status: "denied", output: { error: `Tool "${call.name}" is not available.` } };
      } else {
        try {
          outcome = await opts.execute(call.name, call.arguments);
        } catch {
          outcome = { status: "error", output: { error: "The tool failed. Do not claim it succeeded." } };
        }
      }
      toolCalls.push({ name: call.name, status: outcome.status });
      for (const s of outcome.sources ?? []) sources.set(s.id, s);
      for (const c of outcome.cards ?? []) if (cards.size < MAX_CARDS && !cards.has(c.id)) cards.set(c.id, c);
      input.push({ type: "function_call_output", callId: call.callId, output: JSON.stringify(outcome.output) });
    }
  }
  // Unreachable: the last round always returns.
  return { text: "", toolCalls, sources: [...sources.values()], cards: [...cards.values()], usage };
}
