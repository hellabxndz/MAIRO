import { metaIntelligence } from "@/lib/meta-intelligence";
import type { PlatformIntelligence, PlatformKey } from "./types";

// Marketing Platform Intelligence: one intelligence layer per ad platform.
// Meta is implemented; TikTok, Google Ads, YouTube and LinkedIn slot in here
// with their own sources, capabilities and contract tests, reusing the same
// tables (every row carries `platform`) and the same pipeline.

export const PLATFORM_INTELLIGENCE: Partial<Record<PlatformKey, PlatformIntelligence>> = {
  META: metaIntelligence,
};

export async function runAllPlatformIntelligence(budgetMs = 20_000): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, intel] of Object.entries(PLATFORM_INTELLIGENCE)) {
    out[key] = await intel!.run({ budgetMs }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  }
  return out;
}
