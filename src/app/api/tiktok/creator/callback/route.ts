import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import {
  creatorScopes,
  exchangeCreatorCode,
  explainCreatorAuthError,
  fetchCreatorProfile,
  PUBLISH_SCOPE,
} from "@/lib/ad-platforms/tiktok/creator-oauth";
import { saveCreatorConnection } from "@/lib/tiktok/creator-connection";

const STATE_COOKIE = "myro_tiktok_creator_state";

function redirectWithError(origin: string, message: string) {
  const url = new URL("/dashboard/integrations", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  const denied =
    req.nextUrl.searchParams.get("error_description") ?? req.nextUrl.searchParams.get("errCode");
  if (denied) return redirectWithError(origin, explainCreatorAuthError(denied));

  // Login Kit returns `code`, unlike the Business API's `auth_code` next door.
  // The two TikTok flows genuinely disagree with each other about this.
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return redirectWithError(origin, "Missing authorization code or state from TikTok.");
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
    const token = await exchangeCreatorCode(code);
    const scopes = creatorScopes(token);

    // The profile lookup is a nicety — it turns an open_id into a @handle in
    // the settings screen. A connection with no handle still posts, so this
    // failing must not lose the token that was just granted.
    const profile = await fetchCreatorProfile(token.access_token).catch(() => ({
      openId: token.open_id,
      unionId: null,
      username: null,
      nickname: null,
      avatarUrl: null,
    }));

    await saveCreatorConnection({ organizationId, token, scopes, profile });

    const url = new URL("/dashboard/integrations", origin);
    // Saying which of the two permissions was actually granted, because the
    // difference is between MAIRO posting and MAIRO preparing a draft, and
    // the customer should learn that here rather than after their first video.
    url.searchParams.set(
      "connected",
      scopes.includes(PUBLISH_SCOPE) ? "tiktok_posting" : "tiktok_drafts"
    );
    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to connect TikTok posting.";
    return redirectWithError(origin, explainCreatorAuthError(message));
  }
}
