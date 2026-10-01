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
};

export async function metaGraphRequest<T = unknown>(
  path: string,
  { method = "GET", accessToken, params = {}, body, formParams }: MetaRequestOptions = {}
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

  const res = await (ctx?.fetch ?? fetch)(url.toString(), {
    method,
    headers: contentType ? { "Content-Type": contentType } : undefined,
    body: requestBody,
    cache: "no-store",
  });

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
