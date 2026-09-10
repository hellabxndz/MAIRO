import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { can } from "@/lib/entitlements";
import { buildCreatorAuthUrl } from "@/lib/ad-platforms/tiktok/creator-oauth";
import { tiktokPostingConfigured } from "@/lib/ad-platforms/tiktok/content";

// Starts the *posting* authorization, which is not the advertising one.
//
// Same nonce-in-a-cookie shape as the two routes next door, and a separate
// cookie name on purpose: a customer can quite reasonably have both flows open
// in two tabs, and sharing the cookie would make whichever finished second
// fail the state check for no reason they could understand.

const STATE_COOKIE = "myro_tiktok_creator_state";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  // Checked here as well as in the UI. A hidden button is not access control.
  if (!(await can(organizationId, "tiktok_organic_posting"))) {
    return NextResponse.redirect(
      new URL("/dashboard/integrations?upgrade=tiktok_organic_posting", req.nextUrl.origin)
    );
  }

  if (!tiktokPostingConfigured()) {
    return NextResponse.redirect(
      new URL(
        "/dashboard/integrations?error=" +
          encodeURIComponent(
            "TikTok posting isn't configured on this deployment yet. It needs its own Login Kit credentials."
          ),
        req.nextUrl.origin
      )
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

  try {
    return NextResponse.redirect(buildCreatorAuthUrl(state));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start the TikTok posting connection";
    return NextResponse.redirect(
      new URL(`/dashboard/integrations?error=${encodeURIComponent(message)}`, req.nextUrl.origin)
    );
  }
}
