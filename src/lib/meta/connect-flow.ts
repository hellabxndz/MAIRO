import { db } from "@/lib/db";
import { metaGraphRequest } from "@/lib/meta/client";
import { saveMetaConnection } from "@/lib/meta/connection";
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchAdAccounts, fetchPages, metaRedirectUri, metaScopes } from "@/lib/meta/oauth";
import { REQUIRED_PERMISSIONS, classifyMetaConnect, type MetaConnectCode } from "@/lib/onboarding/problems";

// What happens after Facebook's login hands back a code: swap it for a token,
// check what the business actually allowed, find the ad account and Page,
// and save the connection. Out of the route so it can be tested against a
// pretend Meta (withGraphTransport) — every call here goes through the Graph
// client.
//
// It answers with a reason rather than throwing, so the route can send the
// business back to the step it was on with a plain explanation and nothing
// lost.

export type ConnectResult =
  | { ok: true; adAccountId: string; accountStatus: number; pageId: string | null; pageName: string | null }
  | { ok: false; code: MetaConnectCode; missing?: string[]; technical?: string | null };

/** Which of the permissions MAIRO needs were switched off in the dialog. Null when Meta couldn't say. */
export async function missingPermissions(accessToken: string, asked: string[] = metaScopes()): Promise<string[] | null> {
  try {
    const res = await metaGraphRequest<{ data?: { permission: string; status: string }[] }>("/me/permissions", { accessToken });
    const granted = new Set((res.data ?? []).filter((p) => p.status === "granted").map((p) => p.permission));
    return REQUIRED_PERMISSIONS.filter((p) => asked.includes(p) && !granted.has(p));
  } catch {
    // Not knowing isn't a refusal: the ad account lookup below fails plainly
    // if the permission really is missing.
    return null;
  }
}

export async function completeMetaConnection(organizationId: string, code: string): Promise<ConnectResult> {
  let token: string;
  let expiresIn: number | undefined;
  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    token = longLived.access_token;
    expiresIn = longLived.expires_in;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    return { ok: false, code: classifyMetaConnect({ message: raw }), technical: explainMetaSetupError(raw) };
  }

  const missing = await missingPermissions(token);
  if (missing && missing.length > 0) return { ok: false, code: "permissions", missing };

  let adAccounts;
  try {
    adAccounts = await fetchAdAccounts(token);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const code = /permission|\(#200\)|\(#10\)|ads_management/i.test(raw) ? "permissions" : classifyMetaConnect({ message: raw });
    return { ok: false, code, missing: code === "permissions" ? ["ads_management"] : undefined, technical: raw };
  }
  if (adAccounts.length === 0) return { ok: false, code: "no_ad_account" };

  // Prefer an account that can actually run ads. Meta's account_status 1 is
  // the only value that can spend; a troubled first account with a working
  // second one used to connect the wrong one. Falling back to the first is
  // deliberate — the setup steps then name the account's problem.
  //
  // Reconnecting (to grant one more permission, say) keeps the ad account
  // and Page already chosen, while this login can still reach them.
  const previous = await db.metaAdAccount.findUnique({ where: { organizationId }, select: { metaAdAccountId: true, pageId: true } });
  const chosen = adAccounts.find((a) => a.id === previous?.metaAdAccountId) ?? adAccounts.find((a) => a.account_status === 1) ?? adAccounts[0];

  // No Page isn't a reason to throw the connection away: the ad account is
  // still the right one. The setup steps ask for a Page next.
  const pages = await fetchPages(token).catch(() => []);
  const page = pages.find((p) => p.id === previous?.pageId) ?? pages[0] ?? null;

  await saveMetaConnection({
    organizationId,
    metaAdAccountId: chosen.id,
    // First Page as a starting point, not a decision. The Meta page shows
    // which one was picked and lets it be changed.
    pageId: page?.id ?? null,
    pageName: page?.name ?? null,
    accessToken: token,
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
  });
  return { ok: true, adAccountId: chosen.id, accountStatus: chosen.account_status, pageId: page?.id ?? null, pageName: page?.name ?? null };
}

/**
 * Meta's configuration errors, translated into the setting to change — for
 * whoever runs this deployment, shown under "Details for support". The
 * business sees the plain explanation instead.
 */
export function explainMetaSetupError(raw: string): string {
  if (/client secret/i.test(raw)) {
    return "Meta rejected this app's client secret. The META_APP_SECRET set on this deployment doesn't match the App Secret on the Meta app — most often because the secret was reset in Meta and never updated here, or it was updated but the project hasn't been redeployed since. Copy it again from App settings > Basic, save it, and redeploy.";
  }
  if (/app not active|not currently accessible|isn't available|app is in development/i.test(raw)) {
    return "This Meta app is still unpublished, so only people with a role on it (Administrator, Developer or Tester) can connect. Either add this Facebook account under App roles, or finish App Review to open it to everyone.";
  }
  if (/redirect|url is blocked|uri/i.test(raw)) {
    return `Meta blocked the redirect. Register exactly this URL under Valid OAuth Redirect URIs on the Meta app, with no trailing slash: ${safeRedirectUri()}`;
  }
  if (/invalid scope|permission|ads_management|business_management/i.test(raw)) {
    return "Meta refused one of the permissions this app asks for. A permission App Review hasn't approved only works for accounts with a role on the app — check META_SCOPES isn't asking for one (such as ads_read).";
  }
  return raw;
}

function safeRedirectUri(): string {
  try {
    return metaRedirectUri();
  } catch {
    return "(META_REDIRECT_URI isn't set)";
  }
}
