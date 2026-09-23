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
    const authUrl = buildMetaAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start Meta connect";
    return NextResponse.redirect(
      new URL(`/dashboard/meta?error=${encodeURIComponent(message)}`, req.nextUrl.origin)
    );
  }
}
