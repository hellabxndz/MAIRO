// The Tag Manager API transport.
//
// Ordinary REST with a bearer token, which after Meta's query-parameter auth
// and TikTok's 200-means-failure envelope is a relief. The parts worth writing
// down are the ones specific to writing into somebody's live container.
//
// Paths are hierarchical and absolute: a tag lives at
// accounts/{a}/containers/{c}/workspaces/{w}/tags/{t}, and every write is a
// POST to the parent path. There is no "create tag by container id" — the
// workspace is part of the address, which is why provisioning gets one first.
//
// And 403 means two completely different things. Without the right scope it
// means "this token cannot"; with the right scope it means "this Google
// account is not an admin on that container". They need different fixes and
// the customer can only act on one of them, so they are separated here.

const API_BASE = "https://tagmanager.googleapis.com/tagmanager/v2";

export class GtmApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason: string | null,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "GtmApiError";
  }

  /** The token is dead or was revoked in the customer's Google account. */
  get isAuthProblem(): boolean {
    return this.status === 401;
  }

  /** The token is fine; this Google account cannot edit that container. */
  get isPermissionProblem(): boolean {
    return this.status === 403;
  }

  /** Worth trying again rather than telling the customer. */
  get isTransient(): boolean {
    // 429 included: Tag Manager's per-minute write quota is low enough that a
    // container with a dozen tags can reach it during one provisioning run.
    return this.status >= 500 || this.status === 429;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: Record<string, string | string[] | undefined>;
};

export async function gtmRequest<T>(
  path: string,
  accessToken: string,
  { method = "GET", body, params }: RequestOptions = {}
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined) continue;
    // Repeated keys rather than a comma list: enabling built-in variables
    // takes ?type=PAGE_URL&type=CLICK_URL, and a comma-joined value is
    // accepted and silently enables nothing.
    for (const v of Array.isArray(value) ? value : [value]) url.searchParams.append(key, v);
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (res.status === 204) return undefined as T;

  const json = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string; status?: string; errors?: { reason?: string }[] } })
    | null;

  if (!res.ok) {
    const err = json?.error;
    throw new GtmApiError(
      err?.message || `Tag Manager returned HTTP ${res.status}.`,
      res.status,
      err?.errors?.[0]?.reason ?? err?.status ?? null,
      json
    );
  }

  return json as T;
}

// --- the shapes actually used -----------------------------------------------

export type GtmAccount = { accountId: string; name: string; path: string };

export type GtmContainer = {
  accountId: string;
  containerId: string;
  name: string;
  publicId: string;
  path: string;
  usageContext?: string[];
};

export type GtmWorkspace = {
  accountId: string;
  containerId: string;
  workspaceId: string;
  name: string;
  path: string;
};

export type GtmEntity = { path?: string; name?: string; tagId?: string; triggerId?: string; variableId?: string };

export async function listAccounts(accessToken: string): Promise<GtmAccount[]> {
  const res = await gtmRequest<{ account?: GtmAccount[] }>("accounts", accessToken);
  return res.account ?? [];
}

/**
 * Web containers only.
 *
 * A Google account very often also administers AMP, iOS and server containers,
 * and putting a Meta pixel in a server container is a mistake the customer
 * cannot diagnose — it accepts the tags and fires nothing on their website.
 */
export async function listContainers(
  accessToken: string,
  accountId: string
): Promise<GtmContainer[]> {
  const res = await gtmRequest<{ container?: GtmContainer[] }>(
    `accounts/${accountId}/containers`,
    accessToken
  );
  return (res.container ?? []).filter((c) => (c.usageContext ?? ["web"]).some((u) => u.toLowerCase() === "web"));
}

export async function listWorkspaces(
  accessToken: string,
  accountId: string,
  containerId: string
): Promise<GtmWorkspace[]> {
  const res = await gtmRequest<{ workspace?: GtmWorkspace[] }>(
    `accounts/${accountId}/containers/${containerId}/workspaces`,
    accessToken
  );
  return res.workspace ?? [];
}

export async function createWorkspace(
  accessToken: string,
  accountId: string,
  containerId: string,
  name: string
): Promise<GtmWorkspace> {
  return gtmRequest<GtmWorkspace>(
    `accounts/${accountId}/containers/${containerId}/workspaces`,
    accessToken,
    { method: "POST", body: { name, description: "Created by MAIRO for conversion tracking." } }
  );
}

/**
 * Turns on the built-in variables the triggers depend on.
 *
 * Not optional and easy to forget: {{Click URL}} in a trigger on a container
 * where the built-in is disabled resolves to nothing, so the trigger never
 * matches and the tag never fires. No error is raised at any point.
 *
 * Already-enabled variables come back 400, which is success here.
 */
export async function enableBuiltInVariables(
  accessToken: string,
  workspacePath: string,
  types: string[]
): Promise<void> {
  try {
    await gtmRequest(`${workspacePath}/built_in_variables`, accessToken, {
      method: "POST",
      params: { type: types },
    });
  } catch (error) {
    if (error instanceof GtmApiError && error.status === 400) return;
    throw error;
  }
}

export async function listTags(accessToken: string, workspacePath: string) {
  const res = await gtmRequest<{ tag?: (GtmEntity & { name: string; tagId: string })[] }>(
    `${workspacePath}/tags`,
    accessToken
  );
  return res.tag ?? [];
}

export async function listTriggers(accessToken: string, workspacePath: string) {
  const res = await gtmRequest<{ trigger?: (GtmEntity & { name: string; triggerId: string })[] }>(
    `${workspacePath}/triggers`,
    accessToken
  );
  return res.trigger ?? [];
}

export async function listVariables(accessToken: string, workspacePath: string) {
  const res = await gtmRequest<{ variable?: (GtmEntity & { name: string; variableId: string })[] }>(
    `${workspacePath}/variables`,
    accessToken
  );
  return res.variable ?? [];
}

export async function deleteEntity(accessToken: string, path: string): Promise<void> {
  await gtmRequest(path, accessToken, { method: "DELETE" });
}

export async function createTrigger(
  accessToken: string,
  workspacePath: string,
  trigger: Record<string, unknown>
): Promise<{ triggerId: string; path: string }> {
  return gtmRequest(`${workspacePath}/triggers`, accessToken, { method: "POST", body: trigger });
}

export async function createTag(
  accessToken: string,
  workspacePath: string,
  tag: Record<string, unknown>
): Promise<{ tagId: string; path: string }> {
  return gtmRequest(`${workspacePath}/tags`, accessToken, { method: "POST", body: tag });
}

export async function createVariable(
  accessToken: string,
  workspacePath: string,
  variable: Record<string, unknown>
): Promise<{ variableId: string; path: string }> {
  return gtmRequest(`${workspacePath}/variables`, accessToken, { method: "POST", body: variable });
}

export type GtmVersion = {
  containerVersion?: { containerVersionId?: string; path?: string };
  compilerError?: boolean;
  syncStatus?: { syncError?: boolean };
};

/**
 * Freezes the workspace into a version.
 *
 * Returns no version at all when the workspace has no changes, which is a
 * success the caller has to recognise — an absent containerVersion here is
 * "nothing to publish", not a failure.
 */
export async function createVersion(
  accessToken: string,
  workspacePath: string,
  name: string,
  notes: string
): Promise<GtmVersion> {
  return gtmRequest<GtmVersion>(`${workspacePath}:create_version`, accessToken, {
    method: "POST",
    body: { name, notes },
  });
}

/** Makes a version live. This is the step that changes the customer's site. */
export async function publishVersion(
  accessToken: string,
  versionPath: string
): Promise<void> {
  await gtmRequest(`${versionPath}:publish`, accessToken, { method: "POST" });
}

/** Tag Manager's errors, in terms the customer can act on. */
export function explainGtmApiError(error: unknown): string {
  if (!(error instanceof GtmApiError)) {
    return error instanceof Error ? error.message : "Tag Manager didn't respond.";
  }
  if (error.isAuthProblem) {
    return "Google's permission for MAIRO has expired or been revoked. Reconnect Tag Manager.";
  }
  if (error.isPermissionProblem) {
    return (
      "That Google account can see the container but isn't allowed to publish to it. " +
      "In Tag Manager, the account needs Publish permission on this container."
    );
  }
  if (error.status === 429) {
    return "Tag Manager is rate-limiting this container. Nothing was left half-done — try again in a minute.";
  }
  if (error.isTransient) {
    return "Tag Manager didn't respond. Try again shortly.";
  }
  return `Tag Manager refused this: ${error.message}`;
}
