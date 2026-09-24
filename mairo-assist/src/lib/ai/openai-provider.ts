import "server-only";
import OpenAI from "openai";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { AiProviderError, type AiProvider, type AgentItem, type ProviderResponse } from "./types";

/**
 * OpenAI Responses API adapter. Runs only on the server; the API key never
 * reaches the browser. `store: false` so conversations aren't retained by the
 * provider for later retrieval.
 */
export class OpenAIProvider implements AiProvider {
  private client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    baseURL?: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL, maxRetries: 2, timeout: 30_000 });
  }

  async respond(req: Parameters<AiProvider["respond"]>[0]): Promise<ProviderResponse> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: req.instructions,
        input: req.input.map(toOpenAI),
        tools: req.tools.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters, strict: true })),
        max_output_tokens: req.maxOutputTokens,
        store: false,
        ...(req.safetyIdentifier ? { safety_identifier: req.safetyIdentifier } : {}),
      });
      const functionCalls = response.output.flatMap((item) =>
        item.type === "function_call" ? [{ callId: item.call_id, name: item.name, arguments: item.arguments }] : [],
      );
      return {
        text: response.output_text ?? "",
        functionCalls,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          requestId: response.id,
        },
      };
    } catch (e) {
      if (e instanceof OpenAI.APIError) {
        const retryable = e.status === undefined || e.status === 429 || e.status >= 500;
        throw new AiProviderError(`OpenAI error ${e.status ?? "network"}`, retryable);
      }
      throw new AiProviderError("OpenAI request failed", true);
    }
  }
}

function toOpenAI(item: AgentItem): ResponseInputItem {
  switch (item.type) {
    case "message":
      return { type: "message", role: item.role, content: item.content };
    case "function_call":
      return { type: "function_call", call_id: item.callId, name: item.name, arguments: item.arguments };
    case "function_call_output":
      return { type: "function_call_output", call_id: item.callId, output: item.output };
  }
}
