import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { buildMetaAuthUrl } from "@/lib/meta/oauth";

const STATE_COOKIE = "myro_meta_oauth_state";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }

  const nonce = randomBytes(16).toString("hex");
  const state = `${session.user.organizationId}.${nonce}`;

  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

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
