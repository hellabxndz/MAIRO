import { createAnthropic } from "@ai-sdk/anthropic";

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default model for all MAIRO agents. Override per-call if a task needs a
// different tier (e.g. a cheaper/faster model for short classification calls).
export const agentModel = anthropic("claude-sonnet-5");
