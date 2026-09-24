/** Provider-neutral conversation items used by the agent loop. */
export type AgentItem =
  | { type: "message"; role: "user" | "assistant"; content: string }
  | { type: "function_call"; callId: string; name: string; arguments: string }
  | { type: "function_call_output"; callId: string; output: string };

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the arguments (strict: every property required, no extras). */
  parameters: Record<string, unknown>;
};

export type ProviderUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number; requestId?: string };

export type ProviderResponse = {
  text: string;
  functionCalls: { callId: string; name: string; arguments: string }[];
  usage: ProviderUsage;
};

export interface AiProvider {
  readonly model: string;
  respond(request: {
    instructions: string;
    input: AgentItem[];
    tools: ToolDefinition[];
    maxOutputTokens: number;
    /** Opaque, non-personal identifier for abuse monitoring. */
    safetyIdentifier?: string;
  }): Promise<ProviderResponse>;
}

export class AiProviderError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}
