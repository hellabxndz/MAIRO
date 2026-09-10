import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { tiktokAdapter } from "@/lib/ad-platforms/tiktok/adapter";
import { tiktokRedirectUri } from "@/lib/ad-platforms/tiktok/oauth";

const STATE_COOKIE = "myro_tiktok_oauth_state";

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

  const denied = req.nextUrl.searchParams.get("error_description");
  if (denied) return redirectWithError(origin, denied);

  // TikTok returns the authorization code as auth_code, not code. Reading
  // `code` here — which is what every other OAuth provider calls it, and what
  // the Meta callback next door reads — gets you a null and an error message
  // about a missing code that is technically true and completely misleading.
  const code =
    req.nextUrl.searchParams.get("auth_code") ?? req.nextUrl.searchParams.get("code");
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

  // The state is already proven genuine by the cookie comparison above. This
  // is the separate question of whether the organization it names is one this
  // session may act on — a freelancer connecting TikTok for a client carries
  // that client's id while their session holds the workspace.
  const permitted = await activeOrganizationId();
  if (!organizationId || organizationId !== permitted) {
    return redirectWithError(origin, "This connection doesn't match your account.");
  }

  const result = await tiktokAdapter.connectAccount({
    organizationId,
    code,
    redirectUri: tiktokRedirectUri(),
  });

  if (!result.ok) {
    return redirectWithError(origin, result.error.message);
  }

  const url = new URL("/dashboard/integrations", origin);
  url.searchParams.set("connected", "tiktok");
  return NextResponse.redirect(url);
}
