// The TikTok Business API transport.
//
// Two things about this API differ from Meta's enough to bite, and both are
// handled here so no caller has to remember them.
//
// It authenticates with a header, not a query parameter. The token goes in
// `Access-Token`, and passing it the Meta way — on the URL — fails with an
// unhelpful 40001 rather than an auth error.
//
// And it answers 200 for failures. Every response carries a `code` field in
// its body, and `code: 0` is the only one that means success; a rejected
// budget, an expired token and a malformed request all arrive as HTTP 200 with
// a non-zero code. Checking `res.ok` alone would treat every one of those as a
// successful call and hand the caller an empty `data` object. So the body's
// code is the real status, and that is what this module reports on.

const API_VERSION = process.env.TIKTOK_API_VERSION?.trim() || "v1.3";
const API_BASE = `https://business-api.tiktok.com/open_api/${API_VERSION}`;

/** Codes TikTok returns that mean the credentials are no longer usable. */
const AUTH_CODES = new Set([40001, 40100, 40101, 40102, 40105, 40110]);
/** Codes that mean the token is fine but lacks the permission for this call. */
const SCOPE_CODES = new Set([40002, 40006]);

export class TikTokApiError extends Error {
  constructor(
    message: string,
    /** TikTok's own `code`. Zero never reaches here. */
    public readonly code: number,
    public readonly httpStatus: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "TikTokApiError";
  }

  /** True when reconnecting the account is the fix. */
  get isAuthProblem(): boolean {
    return AUTH_CODES.has(this.code) || this.httpStatus === 401;
  }

  /** True when the connection is good but the granted scopes are too narrow. */
  get isScopeProblem(): boolean {
    return SCOPE_CODES.has(this.code);
  }

  /** True when it's worth trying again rather than telling the customer. */
  get isTransient(): boolean {
    return this.httpStatus >= 500 || this.code === 50000;
  }
}

type TikTokEnvelope<T> = {
  code: number;
  message: string;
  request_id?: string;
  data: T;
};

type RequestOptions = {
  method?: "GET" | "POST";
  accessToken?: string;
  params?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  /** Overrides the base, for the OAuth endpoints that sit outside open_api. */
  baseUrl?: string;
};

export async function tiktokRequest<T = unknown>(
  path: string,
  { method = "GET", accessToken, params = {}, body, baseUrl }: RequestOptions = {}
): Promise<T> {
  const url = new URL(`${baseUrl ?? API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["Access-Token"] = accessToken;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as TikTokEnvelope<T> | null;

  if (!json) {
    throw new TikTokApiError(
      `TikTok returned a response that could not be read (HTTP ${res.status}).`,
      -1,
      res.status,
      null
    );
  }

  // The envelope's code is the real status; see the note at the top.
  if (json.code !== 0) {
    throw new TikTokApiError(
      json.message || `TikTok rejected the request (code ${json.code}).`,
      json.code,
      res.status,
      json
    );
  }

  return json.data;
}

export function tiktokApiVersion(): string {
  return API_VERSION;
}

/**
 * Whether this deployment has TikTok credentials at all.
 *
 * Checked before anything tries to talk to TikTok, so an unconfigured
 * deployment says "TikTok isn't set up on this deployment yet" rather than
 * making a request that cannot succeed and reporting whatever TikTok says
 * about a missing app id.
 */
export function tiktokConfigured(): boolean {
  return Boolean(
    process.env.TIKTOK_APP_ID?.trim() && process.env.TIKTOK_APP_SECRET?.trim()
  );
}

export function requireTikTokEnv(name: string): string {
  // Trimmed for the same reason as the Meta equivalent: these are pasted by
  // hand into a hosting dashboard and very often arrive with a trailing
  // newline, which the network compares byte-for-byte and rejects.
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Add it to your environment — see the TikTok setup section in the README.`
    );
  }
  return value;
}
