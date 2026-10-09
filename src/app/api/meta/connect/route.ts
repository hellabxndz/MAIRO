import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { buildMetaAuthUrl } from "@/lib/meta/oauth";
import { activeOrganizationId } from "@/lib/active-org";
import { RETURN_COOKIE, safeReturnTo } from "@/lib/meta/return-to";

const STATE_COOKIE = "myro_meta_oauth_state";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }

  const organizationId =
    (await activeOrganizationId()) ?? session.user.organizationId;

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

  // Somewhere to come back to afterwards, like the campaign being planned.
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  if (returnTo) {
    cookieStore.set(RETURN_COOKIE, returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });
  } else {
    cookieStore.delete(RETURN_COOKIE);
  }

  try {
    // ?also=page_posts / ?also=instagram: Scale's Facebook and Instagram
    // posting, each asked for on its own, never in the everyday dialog.
    const also = req.nextUrl.searchParams.get("also");
    // ?rerequest=1: connecting again after switching a permission off.
    const authUrl = buildMetaAuthUrl(state, { pagePosting: also === "page_posts", instagram: also === "instagram", rerequest: req.nextUrl.searchParams.get("rerequest") === "1" });
    return NextResponse.redirect(authUrl);
  } catch (error) {
    // Usually a missing setting on this deployment. The business goes back
    // to the step it was on, told plainly; the setting is in the details.
    const message = error instanceof Error ? error.message : "Failed to start Meta connect";
    console.error("Meta connect couldn't start:", message);
    const url = new URL(returnTo ?? "/dashboard/meta", req.nextUrl.origin);
    url.searchParams.set("metaError", "setup");
    url.searchParams.set("metaDetail", message.slice(0, 600));
    if (!returnTo) url.searchParams.set("error", "MAIRO's connection to Meta isn't working right now. This is a problem on MAIRO's side, not something you did — try again later.");
    return NextResponse.redirect(url);
  }
}
