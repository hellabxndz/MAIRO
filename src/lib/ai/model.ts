import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default model for all MAIRO agents. Override per-call if a task needs a
// different tier (e.g. a cheaper/faster model for short classification calls).
export const agentModel = anthropic("claude-sonnet-5");

// The free AI ad plan on the homepage: the most capable model, since it's the
// first thing a visitor sees MAIRO write. Structured output is requested
// natively (lib/ai/ad-plan.ts), never through a forced tool call, which this
// model doesn't accept.
export const planModel = anthropic("claude-opus-5-5");

