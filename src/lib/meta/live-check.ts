import { db } from "@/lib/db";
import { MetaApiError, graphApiVersion, metaGraphRequest, withGraphTransport } from "./client";
import { loadMetaConnection } from "./connection";
import { metaScopes } from "./oauth";
import { metaAccountStatusMessage } from "@/lib/ad-platforms/billing";

// The live Meta check: asks the real Graph API, with the real credentials and
// a business's real token, whether everything MAIRO depends on works — and
// changes nothing while it does.
//
// Read-only is enforced, not promised: every request goes through a transport
// that refuses anything but GET before it leaves the server, so nothing here
// can create, edit, pause or spend, whatever a future edit to this file asks
// for. Nothing is cached or written to the database, Meta's errors from these
// probes aren't counted as customer errors, and no token or secret is ever put
// in a result.

export type StepState = "pass" | "fail" | "warn" | "skip";
export type LiveStep = { key: string; label: string; state: StepState; detail: string };
export type LiveOrgCheck = { organizationId: string; name: string; steps: LiveStep[] };

type Fetch = typeof fetch;

/** Refuses everything but a read, so the check can never change anything on Meta. */
export function readOnlyFetch(inner: Fetch = fetch): Fetch {
  return (input, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") return Promise.reject(new Error(`The live check only reads from Meta — refused a ${method}.`));
    return inner(input, init);
  };
}

function guarded<T>(fn: () => Promise<T>, inner?: Fetch): Promise<T> {
  return withGraphTransport({ fetch: readOnlyFetch(inner), record: false }, fn);
}

const message = (e: unknown) => (e instanceof MetaApiError || e instanceof Error ? e.message : "Unknown error");

/** Removes anything secret that could have found its way into a sentence. */
function redact(steps: LiveStep[], secrets: (string | undefined | null)[]): LiveStep[] {
  const hidden = secrets.filter((s): s is string => Boolean(s && s.length >= 8));
  return steps.map((s) => ({ ...s, detail: hidden.reduce((d, x) => d.split(x).join("[hidden]"), s.detail) }));
}

function appToken(): string | null {
  const id = process.env.META_APP_ID?.trim();
  const secret = process.env.META_APP_SECRET?.trim();
  return id && secret ? `${id}|${secret}` : null;
}

/** The app itself: credentials Meta accepts, on a Graph version it still serves. */
export async function checkMetaApp(opts: { fetch?: Fetch } = {}): Promise<LiveStep[]> {
  const version = graphApiVersion();
  const id = process.env.META_APP_ID?.trim();
  const token = appToken();
  if (!token) {
    return [
      { key: "credentials", label: "App credentials", state: "fail", detail: "META_APP_ID and META_APP_SECRET must both be set — nobody can connect Meta without them." },
      { key: "version", label: "Graph API version", state: "skip", detail: `MAIRO is set to ${version}. Needs the app credentials to test.` },
    ];
  }
  const steps: LiveStep[] = [{ key: "credentials", label: "App credentials", state: "pass", detail: "Both are set." }];
  try {
    const app = await guarded(() => metaGraphRequest<{ id?: string; name?: string }>(`/${id}`, { params: { fields: "id,name", access_token: token } }), opts.fetch);
    steps.push({ key: "app", label: "Meta accepts the app", state: "pass", detail: `Meta answered for “${app.name ?? app.id}” with this ID and secret.` });
    steps.push({ key: "version", label: "Graph API version", state: "pass", detail: `${version} is accepted.` });
  } catch (e) {
    const text = message(e);
    steps.push({ key: "app", label: "Meta accepts the app", state: "fail", detail: text });
    steps.push({
      key: "version",
      label: "Graph API version",
      state: /version/i.test(text) ? "fail" : "skip",
      detail: /version/i.test(text) ? `${version}: ${text}` : `MAIRO is set to ${version}. Not tested — the app check failed first.`,
    });
  }
  return redact(steps, [token, process.env.META_APP_SECRET]);
}

const STATUS_NAME: Record<number, string> = { 1: "active", 2: "disabled", 3: "unsettled", 7: "pending risk review", 8: "pending settlement", 9: "in grace period", 100: "pending closure", 101: "closed" };

type Account = {
  name?: string;
  account_status?: number;
  currency?: string;
  timezone_name?: string;
  funding_source_details?: { id?: string; display_string?: string };
  is_prepay_account?: boolean;
  balance?: string;
};

/**
 * One business's connection, end to end: the stored token, what Meta says
 * about it, the permissions MAIRO needs, the ad account, how it pays, the
 * Page, and whether campaigns, results and the pixel can be read — plus
 * whether the campaigns MAIRO launched are really there.
 */
export async function checkOrganizationMeta(organizationId: string, opts: { fetch?: Fetch } = {}): Promise<LiveStep[]> {
  const steps: LiveStep[] = [];
  let connection: Awaited<ReturnType<typeof loadMetaConnection>>;
  try {
    connection = await loadMetaConnection(organizationId);
  } catch (e) {
    return [{ key: "stored-token", label: "Stored token", state: "fail", detail: `The stored token can't be read (${message(e)}). Was TOKEN_ENCRYPTION_KEY changed? The business needs to reconnect.` }];
  }
  if (!connection) return [{ key: "stored-token", label: "Stored token", state: "skip", detail: "This business hasn't connected Meta." }];
  const token = connection.accessToken;
  const act = connection.metaAdAccountId;
  steps.push({ key: "stored-token", label: "Stored token", state: "pass", detail: `Decrypted. MAIRO marks the connection ${connection.status.toLowerCase()}.` });

  const get = <T>(path: string, params: Record<string, string | number> = {}) =>
    guarded(() => metaGraphRequest<T>(path, { accessToken: token, params }), opts.fetch);

  // 1. Is the token alive? debug_token tells the most (expiry, which app),
  // and needs the app's own token; without it, a plain read still answers.
  const app = appToken();
  let tokenOk = false;
  if (app) {
    try {
      const r = await guarded(
        () => metaGraphRequest<{ data?: { is_valid?: boolean; app_id?: string; expires_at?: number; data_access_expires_at?: number; error?: { message?: string } } }>("/debug_token", { params: { input_token: token, access_token: app } }),
        opts.fetch,
      );
      const d = r.data ?? {};
      tokenOk = Boolean(d.is_valid);
      const expires = d.expires_at ? new Date(d.expires_at * 1000) : null;
      const access = d.data_access_expires_at ? new Date(d.data_access_expires_at * 1000) : null;
      const soon = (x: Date | null) => x && x.getTime() - Date.now() < 7 * 86_400_000;
      const wrongApp = d.app_id && process.env.META_APP_ID && d.app_id !== process.env.META_APP_ID.trim();
      steps.push({
        key: "token",
        label: "Token is valid",
        state: !tokenOk || wrongApp ? "fail" : soon(expires) || soon(access) ? "warn" : "pass",
        detail: !tokenOk
          ? `Meta says the token is no longer valid${d.error?.message ? `: ${d.error.message}` : ""}. The business needs to reconnect.`
          : wrongApp
            ? "The token belongs to a different Meta app than this deployment's."
            : [
                expires ? `Expires ${expires.toDateString()}` : "Doesn't expire",
                access ? `data access until ${access.toDateString()}` : null,
              ]
                .filter(Boolean)
                .join(", ") + ".",
      });
    } catch (e) {
      steps.push({ key: "token", label: "Token is valid", state: "fail", detail: message(e) });
    }
  } else {
    try {
      await get<{ id?: string }>("/me", { fields: "id" });
      tokenOk = true;
      steps.push({ key: "token", label: "Token is valid", state: "pass", detail: "Meta answered a read with it. (Set the app credentials to see its expiry too.)" });
    } catch (e) {
      steps.push({ key: "token", label: "Token is valid", state: "fail", detail: message(e) });
    }
  }
  if (!tokenOk) return redact(steps, [token, app, process.env.META_APP_SECRET]);

  // 2. Permissions: what MAIRO asks for, against what the person granted.
  try {
    const r = await get<{ data?: { permission: string; status: string }[] }>("/me/permissions");
    const granted = new Set((r.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission));
    const declined = (r.data ?? []).filter((p) => p.status === "declined").map((p) => p.permission);
    const missing = metaScopes().filter((s) => !granted.has(s));
    steps.push({
      key: "permissions",
      label: "Permissions MAIRO needs",
      state: missing.length ? "fail" : "pass",
      detail: missing.length
        ? `Missing ${missing.join(", ")}${declined.length ? ` (declined: ${declined.join(", ")})` : ""}. The business needs to reconnect and allow them.`
        : `All granted: ${metaScopes().join(", ")}.`,
    });
  } catch (e) {
    steps.push({ key: "permissions", label: "Permissions MAIRO needs", state: "fail", detail: message(e) });
  }

  // 3. The ad account: status, currency, and how it pays.
  try {
    const a = await get<Account>(`/${act}`, { fields: "name,account_status,currency,timezone_name,funding_source_details,is_prepay_account,balance" });
    const status = a.account_status ?? null;
    const problem = metaAccountStatusMessage(status);
    steps.push({
      key: "account",
      label: "Ad account",
      state: problem ? "fail" : status === null ? "warn" : "pass",
      detail: `“${a.name ?? act}” is ${status !== null ? (STATUS_NAME[status] ?? `status ${status}`) : "of unknown status"}, in ${a.currency ?? "an unknown currency"}${a.timezone_name ? `, ${a.timezone_name}` : ""}.${problem ? ` ${problem}` : ""}`,
    });
    const funded = Boolean(a.funding_source_details?.id || a.funding_source_details?.display_string);
    const emptyPrepay = a.is_prepay_account && a.balance !== undefined && Number(a.balance) <= 0;
    steps.push({
      key: "funding",
      label: "Payment method",
      state: !funded || emptyPrepay ? "warn" : "pass",
      detail: !funded
        ? "No payment method on the ad account — Meta won't deliver ads until one is added."
        : emptyPrepay
          ? "Prepaid account with no balance left — ads stop until it's topped up."
          : `On file: ${a.funding_source_details?.display_string ?? "yes"}.`,
    });
  } catch (e) {
    steps.push({ key: "account", label: "Ad account", state: "fail", detail: message(e) });
  }

  // 4. The Page ads run as.
  if (connection.pageId) {
    try {
      const p = await get<{ id?: string; name?: string }>(`/${connection.pageId}`, { fields: "id,name" });
      steps.push({ key: "page", label: "Facebook Page", state: "pass", detail: `Ads go out as “${p.name ?? connection.pageName ?? connection.pageId}”.` });
    } catch (e) {
      steps.push({ key: "page", label: "Facebook Page", state: "fail", detail: message(e) });
    }
  } else {
    steps.push({ key: "page", label: "Facebook Page", state: "warn", detail: "No Page chosen yet — Meta needs one to run ads." });
  }

  // 5. Reading campaigns and results — what Analytics, the Daily Brief and
  // the optimizer depend on.
  try {
    const r = await get<{ data?: { effective_status?: string }[] }>(`/${act}/campaigns`, { fields: "id,effective_status", limit: 100 });
    const all = r.data ?? [];
    const active = all.filter((c) => c.effective_status === "ACTIVE").length;
    steps.push({ key: "campaigns", label: "Reading campaigns", state: "pass", detail: `Read ${all.length}${all.length === 100 ? "+" : ""} campaign${all.length === 1 ? "" : "s"}, ${active} delivering.` });
  } catch (e) {
    steps.push({ key: "campaigns", label: "Reading campaigns", state: "fail", detail: message(e) });
  }
  try {
    const r = await get<{ data?: { spend?: string; impressions?: string; clicks?: string; account_currency?: string }[] }>(`/${act}/insights`, { fields: "spend,impressions,clicks,account_currency", date_preset: "last_30d" });
    const row = r.data?.[0];
    steps.push({
      key: "insights",
      label: "Reading results",
      state: "pass",
      detail: row ? `Last 30 days: ${row.spend ?? "0"} ${row.account_currency ?? ""} spent, ${row.impressions ?? 0} impressions, ${row.clicks ?? 0} clicks.`.replace(/ +/g, " ") : "Readable — nothing spent in the last 30 days.",
    });
  } catch (e) {
    steps.push({ key: "insights", label: "Reading results", state: "fail", detail: message(e) });
  }

  // 6. The pixel: whether sales can be measured at all.
  try {
    const r = await get<{ data?: { id: string; name?: string; last_fired_time?: string }[] }>(`/${act}/adspixels`, { fields: "id,name,last_fired_time" });
    const pixels = r.data ?? [];
    const fired = pixels.map((p) => (p.last_fired_time ? new Date(p.last_fired_time) : null)).filter((d): d is Date => Boolean(d && !Number.isNaN(d.getTime())));
    const latest = fired.sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
    const recent = latest && Date.now() - latest.getTime() < 7 * 86_400_000;
    steps.push({
      key: "pixel",
      label: "Sales tracking (pixel)",
      state: recent ? "pass" : "warn",
      detail: !pixels.length
        ? "No pixel on this ad account — purchases and leads on the website can't be counted."
        : latest
          ? `${pixels.length} pixel${pixels.length === 1 ? "" : "s"}; last fired ${latest.toDateString()}${recent ? "" : " — not in the last week"}.`
          : `${pixels.length} pixel${pixels.length === 1 ? "" : "s"}, never fired.`,
    });
  } catch (e) {
    steps.push({ key: "pixel", label: "Sales tracking (pixel)", state: "fail", detail: message(e) });
  }

  // 7. The campaigns MAIRO built: really on Meta, and in the state MAIRO thinks.
  const built = await db.platformCampaign.findMany({
    where: { platform: "META", externalCampaignId: { not: null }, mairoCampaign: { organizationId } },
    select: { externalCampaignId: true, mairoCampaign: { select: { name: true, status: true } } },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });
  if (!built.length) {
    steps.push({ key: "mairo-campaigns", label: "Campaigns MAIRO built", state: "skip", detail: "MAIRO hasn't built a campaign on Meta for this business yet." });
  } else {
    const found: string[] = [];
    const drift: string[] = [];
    const missing: string[] = [];
    for (const b of built) {
      try {
        const c = await get<{ effective_status?: string }>(`/${b.externalCampaignId}`, { fields: "id,effective_status" });
        found.push(b.mairoCampaign.name);
        const live = c.effective_status === "ACTIVE";
        if ((b.mairoCampaign.status === "ACTIVE") !== live) drift.push(`“${b.mairoCampaign.name}” is ${b.mairoCampaign.status.toLowerCase()} in MAIRO, ${String(c.effective_status ?? "unknown").toLowerCase()} on Meta`);
      } catch (e) {
        missing.push(`“${b.mairoCampaign.name}”: ${message(e)}`);
      }
    }
    steps.push({
      key: "mairo-campaigns",
      label: "Campaigns MAIRO built",
      state: missing.length ? "fail" : drift.length ? "warn" : "pass",
      detail: [`${found.length} of ${built.length} found on Meta.`, ...drift, ...missing].join(" "),
    });
  }

  return redact(steps, [token, app, process.env.META_APP_SECRET]);
}

/** Every connected business, a few at a time so a slow Meta can't hold the page forever. */
export async function checkConnectedOrganizations(opts: { organizationId?: string; limit?: number; fetch?: Fetch } = {}): Promise<LiveOrgCheck[]> {
  const rows = await db.metaAdAccount.findMany({
    where: opts.organizationId ? { organizationId: opts.organizationId } : {},
    select: { organizationId: true, organization: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: opts.limit ?? 10,
  });
  const out: LiveOrgCheck[] = [];
  for (const r of rows) out.push({ organizationId: r.organizationId, name: r.organization.name, steps: await checkOrganizationMeta(r.organizationId, { fetch: opts.fetch }) });
  return out;
}

export const worstState = (steps: LiveStep[]): StepState =>
  steps.some((s) => s.state === "fail") ? "fail" : steps.some((s) => s.state === "warn") ? "warn" : steps.every((s) => s.state === "skip") ? "skip" : "pass";
