// Whose problem is a Meta error? Pure, pinned by check-meta-reliability.
//
//   meta      Meta's side: an outage, a timeout, a rate limit. Retrying later
//             can work; nothing about the customer or MAIRO needs fixing.
//   account   The customer's connection: an expired token, a permission not
//             granted, something deleted in Ads Manager. Retrying won't help;
//             the customer can fix it (reconnect, grant, choose again).
//   mairo     Meta understood the request and refused it: most likely a MAIRO
//             bug, or Meta changed what it accepts. Retrying won't help;
//             a developer should look.
//
// Codes from Meta's Graph API error reference. Anything not recognised is
// "unknown" and treated as not retryable.

export type FailureCause = "meta_outage" | "rate_limit" | "network" | "token" | "permission" | "not_found" | "rejected" | "unknown";
export type FailureSide = "meta" | "account" | "mairo" | "unknown";

export type Failure = { cause: FailureCause; side: FailureSide; retryable: boolean; label: string };

const RATE_LIMIT = new Set([4, 17, 32, 613]);
const TOKEN = new Set([190, 102, 463, 467]);
const PERMISSION = new Set([10, 294]);

const LABEL: Record<FailureCause, string> = {
  meta_outage: "Meta outage or temporary error",
  rate_limit: "Meta rate limit",
  network: "Meta didn't answer in time",
  token: "Connection expired or revoked",
  permission: "Permission not granted",
  not_found: "Not found on Meta (deleted or not shared)",
  rejected: "Meta refused the request — likely a MAIRO bug or a Meta change",
  unknown: "Unrecognised error",
};

export const SIDE_LABEL: Record<FailureSide, string> = { meta: "Meta's side", account: "Customer's connection", mairo: "MAIRO (investigate)", unknown: "Unknown" };

const make = (cause: FailureCause): Failure => ({
  cause,
  side: cause === "meta_outage" || cause === "rate_limit" || cause === "network" ? "meta" : cause === "token" || cause === "permission" || cause === "not_found" ? "account" : cause === "rejected" ? "mairo" : "unknown",
  retryable: cause === "meta_outage" || cause === "rate_limit" || cause === "network",
  label: LABEL[cause],
});

/** From an HTTP status and Meta's error body (or a stored code/subcode). */
export function classifyMetaFailure(input: { status: number | null; code: number | null; subcode?: number | null; transient?: boolean | null }): Failure {
  const { status, code, subcode } = input;
  if (code !== null && TOKEN.has(code)) return make("token");
  if (code !== null && (RATE_LIMIT.has(code) || (code >= 80000 && code <= 80014))) return make("rate_limit");
  if (code !== null && (PERMISSION.has(code) || (code >= 200 && code < 300))) return make("permission");
  if (code === 100 && subcode === 33) return make("not_found");
  if (code === 1 || code === 2 || input.transient) return make("meta_outage");
  // MAIRO's own time limit (client.ts answers 504 with no body).
  if (status === 504 && code === null) return make("network");
  if (status !== null && status >= 500) return make("meta_outage");
  if (status === 404) return make("not_found");
  if (code === 100 || (status !== null && status >= 400 && status < 500 && code !== null)) return make("rejected");
  return make("unknown");
}

/** The parts of a Graph error body the classifier needs. */
export function errorFields(body: unknown): { code: number | null; subcode: number | null; transient: boolean } {
  const e = body && typeof body === "object" && "error" in body ? (body as { error?: { code?: unknown; error_subcode?: unknown; is_transient?: unknown } }).error : undefined;
  return {
    code: typeof e?.code === "number" ? e.code : null,
    subcode: typeof e?.error_subcode === "number" ? e.error_subcode : null,
    transient: e?.is_transient === true,
  };
}

/** Wait before retry `attempt` (0-based): exponential with jitter, longer for rate limits. */
export function retryDelayMs(attempt: number, cause: FailureCause, baseMs = 500, random = Math.random): number {
  const base = cause === "rate_limit" ? baseMs * 4 : baseMs;
  return Math.round(base * 2 ** attempt + random() * base * 0.5);
}
