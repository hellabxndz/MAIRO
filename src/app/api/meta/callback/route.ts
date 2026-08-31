import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { exchangeCodeForToken, exchangeForLongLivedToken, fetchAdAccounts, fetchPages } from "@/lib/meta/oauth";

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

    await db.metaAdAccount.upsert({
      where: { organizationId },
      create: {
        organizationId,
        metaAdAccountId: adAccounts[0].id,
        pageId: pages[0]?.id,
        accessToken: longLived.access_token,
        tokenExpiresAt,
        status: "CONNECTED",
      },
      update: {
        metaAdAccountId: adAccounts[0].id,
        pageId: pages[0]?.id,
        accessToken: longLived.access_token,
        tokenExpiresAt,
        status: "CONNECTED",
      },
    });

    return NextResponse.redirect(new URL("/dashboard/meta?connected=1", origin));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect to Meta.";
    return redirectWithError(origin, message);
  }
}
