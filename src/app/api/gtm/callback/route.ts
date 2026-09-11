import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import {
  EDIT_SCOPE,
  PUBLISH_SCOPE,
  exchangeGoogleCode,
  explainGoogleAuthError,
  fetchGoogleIdentity,
  googleScopes,
} from "@/lib/tracking/gtm-api/oauth";
import { saveGtmConnection } from "@/lib/tracking/gtm-connection";

const STATE_COOKIE = "myro_gtm_oauth_state";

function redirectWithError(origin: string, message: string) {
  const url = new URL("/dashboard/tracking", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  const denied = req.nextUrl.searchParams.get("error");
  if (denied) return redirectWithError(origin, explainGoogleAuthError(denied));

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return redirectWithError(origin, "Google sent back no authorization code.");
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (!expectedState || expectedState !== state) {
    return redirectWithError(origin, "Invalid OAuth state. Please try connecting again.");
  }

  const [organizationId] = state.split(".");
  const permitted = await activeOrganizationId();
  if (!organizationId || organizationId !== permitted) {
    return redirectWithError(origin, "This connection doesn't match your account.");
  }

  try {
    const token = await exchangeGoogleCode(code);
    const scopes = googleScopes(token);

    // Granting nothing useful is not a connection worth keeping: it would sit
    // in the UI looking connected and fail on the first real action.
    if (!scopes.includes(EDIT_SCOPE)) {
      return redirectWithError(
        origin,
        "MAIRO needs permission to edit your Tag Manager containers, and that box wasn't ticked. Try again and approve all of them."
      );
    }

    // The identity is a nicety — it names the account in settings. It failing
    // must not lose the token that was just granted.
    const identity = await fetchGoogleIdentity(token.access_token).catch(() => ({
      sub: null,
      email: null,
    }));

    await saveGtmConnection({ organizationId, token, scopes, identity });

    const url = new URL("/dashboard/tracking", origin);
    // Says which of the two permissions landed, because without publish the
    // tags get created and change nothing — and that is a difference the
    // customer should learn now rather than from an empty conversion column.
    url.searchParams.set(
      "connected",
      scopes.includes(PUBLISH_SCOPE) ? "gtm" : "gtm_no_publish"
    );
    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't connect Tag Manager.";
    return redirectWithError(origin, explainGoogleAuthError(message));
  }
}
