// Error monitoring: server errors, browser crashes and failed scheduled jobs,
// sent to Sentry so someone is told before a customer has to.
//
// Off unless SENTRY_DSN is set. Talks to Sentry's ingest endpoint directly
// (the documented envelope format) rather than through its SDK, which wraps
// the Next config and build; nothing here can break a build or a page, and
// every send is fire-and-forget with a short timeout.
//
// What leaves the server is deliberately narrow: the error's type, a scrubbed
// message and stack, the route pattern (/s/[token], never the token), the
// method, and the deployment. No headers, cookies, bodies, query strings,
// email addresses, phone numbers or access tokens.

type Level = "error" | "warning";

export type ErrorContext = {
  /** Where it happened: "cron/review: unpaid sweep", "browser", "stripe webhook". */
  where: string;
  /** The route pattern, e.g. /dashboard/campaigns/[id] — preferred over the real path. */
  route?: string;
  /** The real path, used only when there's no pattern; scrubbed and query-free. */
  path?: string;
  method?: string;
  level?: Level;
  /** Opaque ids only (organization id), never names or emails. */
  tags?: Record<string, string>;
};

type Dsn = { endpoint: string; key: string; raw: string };

function parseDsn(raw: string | undefined): Dsn | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    const projectId = url.pathname.split("/").filter(Boolean).pop();
    const prefix = url.pathname.slice(0, url.pathname.lastIndexOf("/"));
    if (!url.username || !projectId) return null;
    return { endpoint: `${url.protocol}//${url.host}${prefix}/api/${projectId}/envelope/`, key: url.username, raw: raw.trim() };
  } catch {
    return null;
  }
}

export function monitoringConfigured(): boolean {
  return parseDsn(process.env.SENTRY_DSN) !== null;
}

/** Removes what must never reach a third party from free text. */
export function scrub(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g, "$1?[query]")
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [token]")
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, "[token]")
    .replace(/\b(sk|rk|pk|whsec|re)_(live_|test_)?[A-Za-z0-9]{8,}/g, "[key]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => (m.replace(/\D/g, "").length >= 10 ? "[number]" : m))
    .slice(0, 1000);
}

function scrubPath(path: string): string {
  return scrub(path.split("?")[0].split("#")[0]);
}

const hex32 = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

type Frame = { function?: string; filename?: string; lineno?: number; colno?: number; in_app?: boolean };

/** V8 stack lines, oldest call first as Sentry expects. */
function framesOf(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n").slice(1, 40)) {
    const m = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!m) continue;
    const filename = scrub(m[2]);
    frames.push({ function: m[1] ? scrub(m[1]) : undefined, filename, lineno: Number(m[3]), colno: Number(m[4]), in_app: !/node_modules|node:internal/.test(filename) });
  }
  return frames.reverse();
}

/** Next.js uses thrown values for redirects and not-found; those aren't failures. */
export function isControlFlow(error: unknown): boolean {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : "";
  const message = error instanceof Error ? error.message : "";
  return /^(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/.test(digest || message);
}

// A failure in a loop must not become a thousand events: the same error is sent
// once a minute at most, and no instance sends more than 60 in ten minutes.
const lastSent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;
function allowed(fingerprint: string, now: number): boolean {
  if (now - windowStart > 10 * 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= 60) return false;
  const last = lastSent.get(fingerprint);
  if (last && now - last < 60_000) return false;
  if (lastSent.size > 500) lastSent.clear();
  lastSent.set(fingerprint, now);
  windowCount++;
  return true;
}

/** Swapped in by checks, so no test ever reaches Sentry. */
type Transport = (endpoint: string, headers: Record<string, string>, body: string) => Promise<void>;
let transport: Transport | null = null;
export async function withMonitoringTransport<T>(t: Transport, fn: () => Promise<T>): Promise<T> {
  const before = transport;
  transport = t;
  lastSent.clear();
  windowCount = 0;
  try {
    return await fn();
  } finally {
    transport = before;
  }
}

async function send(dsn: Dsn, itemType: "event" | "check_in", payload: Record<string, unknown>): Promise<void> {
  const body = [
    JSON.stringify({ sent_at: new Date().toISOString(), dsn: dsn.raw, ...(itemType === "event" ? { event_id: payload.event_id } : {}) }),
    JSON.stringify({ type: itemType }),
    JSON.stringify(payload),
  ].join("\n") + "\n";
  const headers = {
    "Content-Type": "application/x-sentry-envelope",
    "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=mairo/1.0`,
  };
  try {
    if (transport) await transport(dsn.endpoint, headers, body);
    else await fetch(dsn.endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(3_000) });
  } catch {
    // Monitoring that can't reach its server says so once, quietly, and never
    // turns into the failure itself.
    console.error("[monitoring] couldn't reach Sentry");
  }
}

const environment = () => process.env.VERCEL_ENV || process.env.NODE_ENV || "development";
const release = () => process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || undefined;

/** Reports one error. Never throws; does nothing without SENTRY_DSN. */
export async function reportError(error: unknown, context: ErrorContext): Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn || isControlFlow(error)) return;
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Non-error value thrown");
  const type = scrub(err.name || "Error");
  const value = scrub(err.message || "");
  const digest = typeof error === "object" && error !== null && "digest" in error ? String((error as { digest: unknown }).digest) : undefined;
  const frames = framesOf(err.stack);
  const top = frames[frames.length - 1];
  const route = context.route ?? (context.path ? scrubPath(context.path) : undefined);
  if (!allowed(`${context.where}|${type}|${value.slice(0, 200)}|${top?.filename}:${top?.lineno}`, Date.now())) return;

  const eventId = hex32();
  await send(dsn, "event", {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "node",
    level: context.level ?? "error",
    environment: environment(),
    release: release(),
    transaction: route ?? context.where,
    tags: { where: context.where, ...(context.method ? { method: context.method } : {}), ...(digest ? { digest } : {}), ...context.tags },
    exception: { values: [{ type, value, ...(frames.length ? { stacktrace: { frames } } : {}) }] },
    ...(route ? { request: { url: route, method: context.method } } : {}),
  });
}

/**
 * A scheduled job's check-in, so a cron that fails — or never runs at all — is
 * alerted on. The monitor is created in Sentry from the schedule on first use.
 */
export function startCronCheckIn(slug: string, schedule: string, maxRuntimeMinutes = 2): (status: "ok" | "error") => Promise<void> {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return async () => {};
  const checkInId = hex32();
  const started = Date.now();
  const base = {
    check_in_id: checkInId,
    monitor_slug: slug,
    environment: environment(),
    monitor_config: { schedule: { type: "crontab", value: schedule }, checkin_margin: 30, max_runtime: maxRuntimeMinutes, timezone: "UTC" },
  };
  const opened = send(dsn, "check_in", { ...base, status: "in_progress" });
  return async (status) => {
    await opened;
    await send(dsn, "check_in", { ...base, status, duration: (Date.now() - started) / 1000 });
  };
}
