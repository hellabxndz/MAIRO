import type { PerformanceReading } from "./audit";

// Page speed from Google's PageSpeed Insights API (v5), the official tool.
// Two different things come back and are kept apart:
//   lab   — Lighthouse running one simulated phone visit now;
//   field — what real Chrome users experienced over 28 days (CrUX), present
//           only for pages or sites with enough traffic.
// Without PAGESPEED_API_KEY nothing is measured, and the audit says
// "Not checked" rather than guessing speed from page size.

export function pagespeedConfigured(): boolean {
  return Boolean(process.env.PAGESPEED_API_KEY?.trim());
}

type Metric = { percentile?: number; category?: string };
type PsiResponse = {
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, { numericValue?: number }>;
  };
  loadingExperience?: { id?: string; overall_category?: string; metrics?: Record<string, Metric>; origin_fallback?: boolean };
  originLoadingExperience?: { overall_category?: string; metrics?: Record<string, Metric> };
};

/** Pure: turns a PSI response into what the audit uses. Pinned by check-website. */
export function readPagespeed(json: PsiResponse, at = new Date()): PerformanceReading {
  const audits = json.lighthouseResult?.audits ?? {};
  const num = (k: string) => (typeof audits[k]?.numericValue === "number" ? audits[k]!.numericValue! : null);
  const lab = json.lighthouseResult
    ? { score: json.lighthouseResult.categories?.performance?.score ?? null, lcpMs: num("largest-contentful-paint"), cls: num("cumulative-layout-shift"), tbtMs: num("total-blocking-time") }
    : null;
  const le = json.loadingExperience;
  const pageField = le?.metrics && !le.origin_fallback ? { scope: "page" as const, m: le.metrics, cat: le.overall_category } : null;
  const originField = json.originLoadingExperience?.metrics ? { scope: "origin" as const, m: json.originLoadingExperience.metrics, cat: json.originLoadingExperience.overall_category } : null;
  const f = pageField ?? originField;
  const p = (k: string) => (typeof f?.m[k]?.percentile === "number" ? f!.m[k]!.percentile! : null);
  return {
    source: "PageSpeed Insights",
    strategy: "mobile",
    fetchedAt: at.toISOString(),
    lab,
    field: f
      ? { scope: f.scope, lcpMs: p("LARGEST_CONTENTFUL_PAINT_MS"), inpMs: p("INTERACTION_TO_NEXT_PAINT"), cls: p("CUMULATIVE_LAYOUT_SHIFT_SCORE") !== null ? p("CUMULATIVE_LAYOUT_SHIFT_SCORE")! / 100 : null, category: f.cat ?? null }
      : null,
  };
}

/** Runs PSI for a public URL, or returns null when not configured or it fails. */
export async function measurePagespeed(url: string, timeoutMs = 25_000): Promise<PerformanceReading | null> {
  const key = process.env.PAGESPEED_API_KEY?.trim();
  if (!key) return null;
  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", url);
  api.searchParams.set("strategy", "mobile");
  api.searchParams.set("category", "performance");
  api.searchParams.set("key", key);
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return readPagespeed((await res.json()) as PsiResponse);
  } catch {
    return null;
  }
}
