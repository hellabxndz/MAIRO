import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchAdAccounts,
  fetchPages,
  metaRedirectUri,
} from "@/lib/meta/oauth";
import { stopExploring } from "@/lib/explore-mode";
import { saveMetaConnection } from "@/lib/meta/connection";

const STATE_COOKIE = "myro_meta_oauth_state";

function redirectWithError(origin: string, message: string) {
  const url = new URL("/dashboard/meta", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  const error = req.nextUrl.searchParams.get("error_description");
  if (error) return redirectWithError(origin, error);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return redirectWithError(origin, "Missing code or state from Meta.");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!expectedState || expectedState !== state) {
    return redirectWithError(origin, "Invalid OAuth state. Please try connecting again.");
  }

  const [organizationId] = state.split(".");
  if (organizationId !== session.user.organizationId) {
    return redirectWithError(origin, "This connection doesn't match your account.");
  }

  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);

    const adAccounts = await fetchAdAccounts(longLived.access_token);
    if (adAccounts.length === 0) {
      return redirectWithError(
        origin,
        "No Meta ad accounts found for this login. Create an ad account in Meta Business Manager first."
      );
    }

    const pages = await fetchPages(longLived.access_token);

    const tokenExpiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000)
      : null;

    await saveMetaConnection({
      organizationId,
      metaAdAccountId: adAccounts[0].id,
      pageId: pages[0]?.id ?? null,
      accessToken: longLived.access_token,
      tokenExpiresAt,
    });

    // A real connection makes "looking around first" moot — drop the flag so
    // the not-connected banner disappears and the funnel is back to normal.
    await stopExploring();

    return NextResponse.redirect(new URL("/dashboard/meta?connected=1", origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect to Meta.";
    return redirectWithError(origin, explainMetaError(message));
  }
}

/**
 * Turns Meta's OAuth errors into something that names the actual fix.
 *
 * Every one of these is a configuration problem on the deployment, not
 * something the person clicking the button did wrong — but Meta phrases them
 * as if you were supposed to already know. "Error validating client secret."
 * is a complete sentence to Meta and a dead end to everyone else, so each of
 * the ones that actually happen gets translated into the setting to go change.
 */
function explainMetaError(raw: string): string {
  if (/client secret/i.test(raw)) {
    return (
      "Meta rejected this app's client secret. The META_APP_SECRET set on this " +
      "deployment doesn't match the App Secret on the Meta app — most often " +
      "because the secret was reset in Meta and never updated here, or it was " +
      "updated but the project hasn't been redeployed since. Copy it again from " +
      "App settings > Basic, save it, and redeploy."
    );
  }

  if (/app not active|not currently accessible|isn't available|app is in development/i.test(raw)) {
    return (
      "This Meta app is still unpublished, so only people with a role on it " +
      "(Administrator, Developer or Tester) can connect. Either add this " +
      "Facebook account under App roles, or finish App Review to open it to " +
      "everyone."
    );
  }

  if (/redirect|url is blocked|uri/i.test(raw)) {
    return (
      `Meta blocked the redirect. Register exactly this URL under Valid OAuth ` +
      `Redirect URIs on the Meta app, with no trailing slash: ${metaRedirectUri()}`
    );
  }

  if (/invalid scope|permission|ads_management|business_management/i.test(raw)) {
    return (
      "Meta refused one of the permissions this app asks for. Until App Review " +
      "approves them, ads_management, ads_read, business_management and " +
      "pages_show_list only work for accounts with a role on the app."
    );
  }

  return raw;
}
