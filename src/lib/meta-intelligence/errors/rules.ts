import { createHash } from "node:crypto";

// Meta error monitoring, pure. A change at Meta often shows up first as an
// error MAIRO has never seen, across many accounts at once.

/** /act_123/campaigns → /act_:id/campaigns; long numeric ids → :id. */
export function endpointPattern(path: string): string {
  return path
    .split("?")[0]
    .replace(/act_\d+/g, "act_:id")
    .replace(/\/\d{5,}(?=\/|$)/g, "/:id")
    .replace(/\/\d+_\d+(?=\/|$)/g, "/:id");
}

export function errorSignature(input: { code: number | null; subcode: number | null; endpoint: string; method: string }): string {
  return createHash("sha256").update(`${input.code ?? "-"}|${input.subcode ?? "-"}|${input.endpoint}|${input.method}`).digest("hex").slice(0, 32);
}

/** A stable, irreversible key for an account: never the token itself. */
export function accountKey(token: string | undefined | null): string {
  return token ? createHash("sha256").update(token).digest("hex").slice(0, 16) : "anonymous";
}

/** What kind of request a path is, for grouping. */
export function requestType(path: string, method: string): string {
  const p = endpointPattern(path);
  if (/\/insights/.test(p)) return "insights";
  if (/\/campaigns$/.test(p)) return method === "POST" ? "create-campaign" : "read-campaigns";
  if (/\/adsets$/.test(p)) return method === "POST" ? "create-adset" : "read-adsets";
  if (/\/adcreatives$/.test(p)) return "creative";
  if (/\/ads$/.test(p)) return method === "POST" ? "create-ad" : "read-ads";
  if (/\/adimages$|\/advideos$/.test(p)) return "media";
  if (/\/media(_publish)?$|\/feed$/.test(p)) return "publishing";
  if (/permissions|oauth|access_token/.test(p)) return "auth";
  return method === "GET" ? "read" : "write";
}

/** Codes that mean one person's problem, not a platform change. */
const PERSONAL = new Set([190, 102, 463, 467]);

export const SPIKE_ACCOUNTS = 3;
export const SPIKE_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * "Possible Meta API behavior change": a signature first seen recently,
 * already hitting several different accounts, that isn't an expired-token
 * kind of error.
 */
export function isSpike(row: { code: number | null; firstAt: Date; accountKeys: string[]; flagged: boolean }, now: Date): boolean {
  if (row.flagged) return false;
  if (row.code !== null && PERSONAL.has(row.code)) return false;
  return now.getTime() - row.firstAt.getTime() <= SPIKE_WINDOW_MS && new Set(row.accountKeys).size >= SPIKE_ACCOUNTS;
}
