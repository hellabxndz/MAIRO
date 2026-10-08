import { AsyncLocalStorage } from "node:async_hooks";
import { DEFAULT_GRAPH_API_VERSION } from "@/lib/meta-intelligence/capabilities";

// The version MAIRO builds against (metaCapabilities, tracked by Meta
// Intelligence's API version registry). META_GRAPH_API_VERSION overrides it,
// e.g. to roll back without a code change.
const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
const GRAPH_HOST = "https://graph.facebook.com";

/**
 * Meta Intelligence's test harness: a transport (and optionally an API
 * version) for every Graph call made inside withGraphTransport(). Scoped to
 * that async context only — a contract test running a stubbed Meta, or a
 * sandbox run trying a candidate version, can never affect a customer's
 * request running at the same moment.
 */
type Transport = { fetch: typeof fetch; version?: string; record?: boolean };
const transport = new AsyncLocalStorage<Transport>();

export function withGraphTransport<T>(t: Transport, fn: () => Promise<T>): Promise<T> {
  return transport.run(t, fn);
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

type MetaRequestOptions = {
  method?: "GET" | "POST" | "DELETE";
  accessToken?: string;
  params?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  /**
   * Fields that belong in the POST body, form-encoded, rather than the URL.
   *
   * Everything in `params` above ends up in the query string, which is fine
   * for a campaign name or a JSON-stringified targeting spec — a few hundred
   * bytes at most. It is not fine for an uploaded image's base64 bytes, which
   * can run to megabytes: Meta's edge (and most things in front of it) caps a
   * URL's length far below that and answers with a 400 whose body usually
   * isn't even JSON, which is why that failure used to show up as a bare
   * "status 400" with no explanation. `formParams` is the same idea as
   * `params` but sent as the request body instead, which has no such limit.
   */
  formParams?: Record<string, string | number | undefined>;
  /**
   * Reuse this read's answer for this many milliseconds. Only for reads, and
   * only where a minute-old answer is as good as a new one: results (Meta's
   * own figures lag by far longer than that) and the account's billing state.
   * See READS below.
   */
  cacheFor?: number;
};

/**
 * Recent answers to cacheable reads, so one click doesn't ask Meta the same
 * question several times.
 *
 * The Overview alone used to read this month's results, the billing state and
 * every campaign's ads separately for the goal card, the recommendations, the
 * intelligence and the decisions — each a fresh round trip to Meta, each
 * taking anywhere from a few hundred milliseconds to a couple of seconds, and
 * the page waited for all of them. Then the next click asked again.
 *
 * In memory, per server instance: no figures or tokens are written anywhere.
 * A request still in flight is shared rather than repeated. Failures are never
 * kept — the next read tries again. Anything MAIRO changes on Meta with a
 * token forgets every answer read with that token, so a paused campaign or a
 * new budget is never shown as it was a minute ago.
 */
const READ_TIMEOUT_MS = 20_000;
const WRITE_TIMEOUT_MS = 120_000;

/** Results: Meta's own figures trail real time by far more than this. */
export const RESULTS_TTL = 120_000;
/** Account state (billing, ad review): short, so a fix made on Meta shows up quickly. */
export const ACCOUNT_TTL = 30_000;

const READS = new Map<string, { token: string; until: number; value: Promise<unknown> }>();
const MAX_READS = 500;

function forgetReads(accessToken: string) {
  for (const [key, entry] of READS) if (entry.token === accessToken) READS.delete(key);
}

function cachedRead<T>(key: string, token: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = READS.get(key);
  if (hit && hit.until > now) return hit.value as Promise<T>;
  if (READS.size >= MAX_READS) {
    for (const [k, e] of READS) if (e.until <= now) READS.delete(k);
    // Still full of live entries: drop the oldest (Map keeps insertion order).
    while (READS.size >= MAX_READS) READS.delete(READS.keys().next().value!);
  }
  const value = load();
  READS.set(key, { token, until: now + ttl, value });
  value.catch(() => {
    if (READS.get(key)?.value === value) READS.delete(key);
  });
  return value;
}

export async function metaGraphRequest<T = unknown>(
  path: string,
  options: MetaRequestOptions = {}
): Promise<T> {
  const { method = "GET", accessToken, cacheFor } = options;
  // A test harness's stubbed Meta is never cached, nor read from the cache.
  if (method === "GET" && cacheFor && cacheFor > 0 && accessToken && !transport.getStore()) {
    const key = `${path}?${JSON.stringify(options.params ?? {})}#${accessToken}`;
    return cachedRead(key, accessToken, cacheFor, () => sendGraphRequest<T>(path, options));
  }
  if (method === "GET" || !accessToken) return sendGraphRequest<T>(path, options);
  // A change: forget what was read with this token, before and after, so a
  // read that raced the change can't keep the old answer either.
  forgetReads(accessToken);
  try {
    return await sendGraphRequest<T>(path, options);
  } finally {
    forgetReads(accessToken);
  }
}

async function sendGraphRequest<T>(
  path: string,
  { method = "GET", accessToken, params = {}, body, formParams }: MetaRequestOptions
): Promise<T> {
  const ctx = transport.getStore();
  const version = ctx?.version ?? GRAPH_VERSION;
  const url = new URL(`${GRAPH_HOST}/${version}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  if (accessToken) url.searchParams.set("access_token", accessToken);

  let requestBody: string | undefined;
  let contentType: string | undefined;
  if (body) {
    requestBody = JSON.stringify(body);
    contentType = "application/json";
  } else if (formParams) {
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(formParams)) {
      if (value !== undefined) form.set(key, String(value));
    }
    requestBody = form.toString();
    contentType = "application/x-www-form-urlencoded";
  }

  // A time limit on every call. Without one, a Meta request that never
  // answers held the page on its loading screen until the server gave up —
  // a minute or more of nothing. Reads are given 20 seconds (Meta's slowest
  // honest answers, a large account's all-time results, come in well under);
  // changes and uploads get longer, since a video can take a while to send.
  const limit = method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
  let res: Response;
  try {
    res = await (ctx?.fetch ?? fetch)(url.toString(), {
      method,
      headers: contentType ? { "Content-Type": contentType } : undefined,
      body: requestBody,
      cache: "no-store",
      signal: AbortSignal.timeout(limit),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new MetaApiError(`Meta didn't answer within ${Math.round(limit / 1000)} seconds. Try again in a minute.`, 504, null);
    }
    throw error;
  }

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    // Meta Intelligence watches every Graph error: an unfamiliar one spreading
    // across accounts is often the first sign Meta changed something. Fire and
    // forget — monitoring can never break or slow the request it watches.
    if (ctx?.record !== false) {
      void import("@/lib/meta-intelligence/errors/monitor")
        .then((m) => m.recordMetaError({ status: res.status, body: json, path, method, apiVersion: version, accessToken }))
        .catch(() => undefined);
    }
    throw new MetaApiError(describeGraphError(json, res.status), res.status, json);
  }

  return json as T;
}

/**
 * Turns a Graph error body into a sentence worth showing someone.
 *
 * Only `error.message` used to survive, and for the most common failure that
 * is the literal string "Invalid parameter" — code 100, which Meta returns for
 * a missing field, a field that contradicts another field, and a value it does
 * not like, all alike. It says nothing, it cannot be searched for, and it sent
 * a real customer's campaign into a dead end with no way to tell what was
 * wrong with it.
 *
 * Meta does explain itself; it just does so in the fields nobody was reading.
 * `error_user_msg` is written for a person to read, `error_user_title` names
 * the problem, and the subcode is the part that makes a search useful. Kept in
 * that order, and the raw message kept too, because when they disagree the
 * disagreement is itself a clue.
 */
export function describeGraphError(body: unknown, status: number): string {
  const error =
    body && typeof body === "object" && "error" in body
      ? (body as {
          error?: {
            message?: string;
            error_user_title?: string;
            error_user_msg?: string;
            error_subcode?: number;
            code?: number;
          };
        }).error
      : undefined;

  if (!error) return `Meta Graph API request failed with status ${status}`;

  // Most specific first. The user-facing pair is what Meta wrote for a human;
  // the generic message is the fallback when it did not write one.
  const human = [error.error_user_title, error.error_user_msg]
    .filter(Boolean)
    .join(": ");
  const generic = error.message?.trim();

  const parts: string[] = [];
  if (human) parts.push(human);
  if (generic && generic !== human) parts.push(generic);
  if (parts.length === 0) parts.push(`Meta refused it (HTTP ${status})`);

  // Codes last and in brackets: useless to the customer, and the first thing
  // anybody looking the failure up actually needs.
  const codes = [
    error.code !== undefined ? `code ${error.code}` : null,
    error.error_subcode !== undefined ? `subcode ${error.error_subcode}` : null,
  ].filter(Boolean);
  if (codes.length > 0) parts.push(`(${codes.join(", ")})`);

  return parts.join(" ");
}

export function graphApiVersion() {
  return GRAPH_VERSION;
}

/**
 * Every page of a Graph list, following paging.next — but only back to Graph
 * itself, and at most `maxPages`, so a misbehaving cursor can't loop forever
 * or send the token anywhere else.
 */
export async function metaGraphPaginate<T>(
  path: string,
  options: MetaRequestOptions & { maxPages?: number } = {}
): Promise<T[]> {
  const out: T[] = [];
  const maxPages = options.maxPages ?? 10;
  let page = await metaGraphRequest<{ data?: T[]; paging?: { next?: string; cursors?: { after?: string } } }>(path, options);
  for (let i = 0; ; i++) {
    out.push(...(page.data ?? []));
    const after = page.paging?.cursors?.after;
    const next = page.paging?.next;
    if (!next || !after || i + 1 >= maxPages) break;
    let nextUrl: URL;
    try {
      nextUrl = new URL(next);
    } catch {
      break;
    }
    if (nextUrl.origin !== GRAPH_HOST) break;
    page = await metaGraphRequest(path, { ...options, params: { ...(options.params ?? {}), after } });
  }
  return out;
}
