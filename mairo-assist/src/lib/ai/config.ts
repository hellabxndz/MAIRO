import "server-only";
import { env } from "@/lib/env";
import { OpenAIProvider } from "./openai-provider";
import type { AiProvider } from "./types";

/** Returns the configured provider, or null when AI isn't set up. */
export function getProvider(): AiProvider | null {
  const e = env();
  if (!e.OPENAI_API_KEY || !e.OPENAI_MODEL) return null;
  return new OpenAIProvider(e.OPENAI_API_KEY, e.OPENAI_MODEL, process.env.OPENAI_BASE_URL || undefined);
}

function price(name: string) {
  const v = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Estimated cost of one request in USD from per-million-token prices set in
 * the environment (prices change; they are not hard-coded). Returns 0 when
 * prices aren't configured — the billing page then says so.
 */
export function estimateCostUsd(usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number }) {
  const input = price("OPENAI_PRICE_INPUT_PER_MTOK");
  const output = price("OPENAI_PRICE_OUTPUT_PER_MTOK");
  if (input === null || output === null) return 0;
  const cached = price("OPENAI_PRICE_CACHED_INPUT_PER_MTOK") ?? input;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (uncached * input + usage.cachedInputTokens * cached + usage.outputTokens * output) / 1_000_000;
}

export function costPricingConfigured() {
  return price("OPENAI_PRICE_INPUT_PER_MTOK") !== null && price("OPENAI_PRICE_OUTPUT_PER_MTOK") !== null;
}

export const LIMITS = {
  /** Longest customer message accepted. */
  maxCustomerMessageChars: 2000,
  /** Messages of history sent to the model. */
  historyMessages: 20,
  /** Preview messages per business per hour. */
  previewPerHour: 120,
  /** Messages per conversation before the AI hands over to the team. */
  maxMessagesPerConversation: 80,
};
