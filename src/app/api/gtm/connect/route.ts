import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { activeOrganizationId } from "@/lib/active-org";
import { buildGtmAuthUrl, gtmApiConfigured } from "@/lib/tracking/gtm-api/oauth";

// Starts the Google authorization for Tag Manager.
//
// Same nonce-in-a-cookie shape as the Meta and TikTok routes, with its own
// cookie name so a customer connecting two things in two tabs does not fail
// the state check on whichever finishes second.

const STATE_COOKIE = "myro_gtm_oauth_state";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }

  const organizationId = (await activeOrganizationId()) ?? session.user.organizationId;

  if (!gtmApiConfigured()) {
    return NextResponse.redirect(
      new URL(
        "/dashboard/tracking?error=" +
          encodeURIComponent(
            "Tag Manager provisioning isn't configured on this deployment yet. You can still download the container file."
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
    return NextResponse.redirect(buildGtmAuthUrl(state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't start the Google connection.";
    return NextResponse.redirect(
      new URL(`/dashboard/tracking?error=${encodeURIComponent(message)}`, req.nextUrl.origin)
    );
  }
}
