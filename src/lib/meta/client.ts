const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

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
};

export async function metaGraphRequest<T = unknown>(
  path: string,
  { method = "GET", accessToken, params = {}, body }: MetaRequestOptions = {}
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  if (accessToken) url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString(), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
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
