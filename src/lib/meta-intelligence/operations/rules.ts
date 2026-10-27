import type { FailureCause } from "../errors/classify";

// How MAIRO's changes on Meta are going, platform-wide, pure (pinned by
// check-meta-reliability). Only writes are counted — creating campaigns, ads
// and media ("build"), switching on, pausing and budgets ("change"), and the
// connection itself ("auth") — the actions that matter if Meta is failing.
//
// When Meta's own side is failing one kind of action across the board, that
// action is paused (only that one): MAIRO stops starting new attempts that
// would fail, keeps everything the customer made, says what's unavailable and
// tries again once Meta recovers. A customer's own expired token or missing
// permission never pauses anything for anyone else, and a request Meta
// refuses (a likely MAIRO bug) is flagged for a developer, not paused.

export type Operation = "build" | "change" | "auth";
export const OPERATIONS: Operation[] = ["build", "change", "auth"];

export const OPERATION_LABEL: Record<Operation, string> = {
  build: "Creating campaigns, ad sets, ads and media",
  change: "Switching on, pausing and budget changes",
  auth: "Connecting Meta accounts",
};

export type Stat = { operation: string; hour: Date; ok: number; metaDown: number; rateLimited: number; account: number; rejected: number };

/** The counter a write's outcome goes in. */
export function bucketFor(cause: FailureCause | null): keyof Omit<Stat, "operation" | "hour"> {
  if (cause === null) return "ok";
  if (cause === "rate_limit") return "rateLimited";
  if (cause === "meta_outage" || cause === "network") return "metaDown";
  if (cause === "token" || cause === "permission" || cause === "not_found") return "account";
  return "rejected";
}

/** Which operation a Graph write is, by its path. Reads aren't counted. */
export function operationOf(path: string, method: string): Operation | null {
  const p = path.split("?")[0];
  if (/\/oauth\/|\/permissions$|access_token/.test(p)) return "auth";
  if (method === "GET") return null;
  if (/^\/act_\d+\/(campaigns|adsets|ads|adcreatives|adimages|advideos|adspixels)$/.test(p)) return "build";
  if (/^\/\d+(_\d+)?$/.test(p)) return "change";
  return null;
}

const HOUR = 3_600_000;
export const hourOf = (d: Date) => new Date(Math.floor(d.getTime() / HOUR) * HOUR);

/** At least this many of Meta's own failures before anything is paused. */
export const PAUSE_MIN_FAILURES = 3;
/** …and at least this share of the attempts Meta could have answered. */
export const PAUSE_SHARE = 0.5;

export type OperationHealth = {
  operation: Operation;
  state: "ok" | "paused" | "investigate";
  attempts: number;
  okCount: number;
  metaFailures: number;
  rejected: number;
  /** Plain words for whoever sees it. */
  reason: string | null;
};

/** The last hour or so (this hour and the one before). */
export function operationHealth(stats: Stat[], now: Date): OperationHealth[] {
  const since = hourOf(new Date(now.getTime() - HOUR));
  return OPERATIONS.map((operation) => {
    const rows = stats.filter((s) => s.operation === operation && s.hour >= since && s.hour <= now);
    const sum = (k: keyof Omit<Stat, "operation" | "hour">) => rows.reduce((n, r) => n + r[k], 0);
    const ok = sum("ok");
    const down = sum("metaDown");
    const limited = sum("rateLimited");
    const rejected = sum("rejected");
    const meta = down + limited;
    const attempts = ok + meta + sum("account") + rejected;
    if (meta >= PAUSE_MIN_FAILURES && meta / (ok + meta) >= PAUSE_SHARE) {
      return {
        operation,
        state: "paused",
        attempts,
        okCount: ok,
        metaFailures: meta,
        rejected,
        reason: limited > down ? "Meta is limiting how many requests it accepts right now." : "Meta's systems are failing or not answering right now.",
      };
    }
    if (rejected >= PAUSE_MIN_FAILURES && rejected / (ok + rejected) >= PAUSE_SHARE) {
      return { operation, state: "investigate", attempts, okCount: ok, metaFailures: meta, rejected, reason: "Meta is refusing most of what MAIRO sends — a likely MAIRO bug or a change on Meta's side. A developer should look." };
    }
    return { operation, state: "ok", attempts, okCount: ok, metaFailures: meta, rejected, reason: null };
  });
}

/** What a customer is told when an action they need is paused. */
export function pausedMessage(operation: Operation, reason: string): string {
  const what = operation === "build" ? "new campaigns and ads" : operation === "change" ? "changes to campaigns (switching them on or off, budgets)" : "new account connections";
  return `Meta isn't accepting ${what} right now. ${reason} Nothing was changed, and everything you've set up is saved. Try again once Meta recovers — usually within the hour; anything MAIRO was due to do on its own, it does on its next run.`;
}

/**
 * A drop in how often an operation succeeds: the last 24 hours against the
 * 7 days before, among requests Meta answered. Needs enough attempts in both
 * to mean anything.
 */
export function successDrop(stats: Stat[], operation: Operation, now: Date): { before: number; after: number } | null {
  const dayAgo = now.getTime() - 24 * HOUR;
  const weekAgo = dayAgo - 7 * 24 * HOUR;
  const rate = (rows: Stat[]) => {
    const ok = rows.reduce((n, r) => n + r.ok, 0);
    const bad = rows.reduce((n, r) => n + r.metaDown + r.rateLimited + r.rejected, 0);
    return ok + bad >= 10 ? { rate: ok / (ok + bad), n: ok + bad } : null;
  };
  const mine = stats.filter((s) => s.operation === operation);
  const recent = rate(mine.filter((s) => s.hour.getTime() >= dayAgo));
  const prior = rate(mine.filter((s) => s.hour.getTime() >= weekAgo && s.hour.getTime() < dayAgo));
  if (!recent || !prior) return null;
  return prior.rate - recent.rate >= 0.2 ? { before: Math.round(prior.rate * 100), after: Math.round(recent.rate * 100) } : null;
}
