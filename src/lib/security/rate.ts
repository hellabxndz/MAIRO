// Small, in-memory request limits for public endpoints that cost nothing to
// call but write to the database (the funnel events). Per serverless
// instance — best-effort across instances, which is enough to stop a loop
// from one machine without a store of its own. Endpoints that spend money
// (the AI tools, the website reader) use the database-backed quotas in
// lib/tools instead.

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 120;
const MAX_KEYS = 5_000;
const seen = new Map<string, number[]>();

/** The caller's address as the platform reports it; "unknown" when it can't be read. */
export function requestAddress(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** True once `key` has made more than MAX_PER_WINDOW requests in the last ten minutes. */
export function tooManyEvents(key: string, now: number, store: Map<string, number[]> = seen): boolean {
  const recent = (store.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    store.set(key, recent);
    return true;
  }
  recent.push(now);
  store.set(key, recent);
  if (store.size > MAX_KEYS) store.delete(store.keys().next().value as string);
  return false;
}

export const EVENT_LIMIT = { windowMs: WINDOW_MS, max: MAX_PER_WINDOW };

// The Meta Ads Analyzer: a handful of runs per business is plenty (Meta's
// figures are cached for two minutes anyway); a loop is refused.
const runs = new Map<string, number[]>();
export const ANALYZER_LIMIT = { windowMs: 10 * 60_000, max: 10 };
export function tooManyAnalyzerRuns(organizationId: string, now: number, store: Map<string, number[]> = runs): boolean {
  const recent = (store.get(organizationId) ?? []).filter((t) => now - t < ANALYZER_LIMIT.windowMs);
  if (recent.length >= ANALYZER_LIMIT.max) return true;
  recent.push(now);
  store.set(organizationId, recent);
  return false;
}
