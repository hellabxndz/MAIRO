import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { buildTikTokAuthUrl, SPARK_ADS_SCOPE } from "@/lib/ad-platforms/tiktok/oauth";
import { activeOrganizationId } from "@/lib/active-org";
import { can } from "@/lib/entitlements";

// Starts the TikTok authorization.
//
// Deliberately the same shape as the Meta connect route: a random nonce in an
// httpOnly cookie, the organization id carried in the state, and the two
// compared on the way back. The cookie proves the callback belongs to this
// browser; the comparison in the callback proves the organization belongs to
// this session. Neither check is sufficient alone.

const STATE_COOKIE = "myro_tiktok_oauth_state";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  // Connecting TikTok at all is a paid capability, so it is checked here as
  // well as in the UI. A button being hidden is not access control.
  if (!(await can(organizationId, "tiktok_ads"))) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations?upgrade=tiktok_ads", req.nextUrl.origin)
    );
  }

  const nonce = randomBytes(16).toString("hex");
  const state = `${organizationId}.${nonce}`;

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  // Spark Ads need permission to read the business's own posts, which is a
  // materially bigger ask than "run ads for me". It is only added when the
  // customer has asked for the feature that uses it, so a first connection
  // shows the smallest consent screen it can.
  const spark = req.nextUrl.searchParams.get("spark") === "1";

  try {
    return NextResponse.redirect(buildTikTokAuthUrl(state, spark ? [SPARK_ADS_SCOPE] : []));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start the TikTok connection";
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${encodeURIComponent(message)}`, req.nextUrl.origin)
    );
  }
}
