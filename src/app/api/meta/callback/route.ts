import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { stopExploring } from "@/lib/explore-mode";
import { activeOrganizationId } from "@/lib/active-org";
import { RETURN_COOKIE, safeReturnTo } from "@/lib/meta/return-to";
import { completeMetaConnection } from "@/lib/meta/connect-flow";
import { classifyMetaConnect, explainMetaConnect, type MetaConnectCode } from "@/lib/onboarding/problems";

const STATE_COOKIE = "myro_meta_oauth_state";

/**
 * Back to the step they started from, with the reason — never to a page they
 * didn't come from. A connection that fails halfway through setup used to
 * drop the business on the Meta settings page, out of the setup steps, with
 * Meta's raw words; now it returns to where they were, says what happened in
 * plain words, and everything they'd done is still there.
 */
function failed(origin: string, returnTo: string | null, code: MetaConnectCode, extra: { missing?: string[]; technical?: string | null } = {}) {
  const url = new URL(returnTo ?? "/dashboard/meta", origin);
  url.searchParams.set("metaError", code);
  if (extra.missing?.length) url.searchParams.set("missing", extra.missing.join(","));
  if (extra.technical) url.searchParams.set("metaDetail", extra.technical.slice(0, 600));
  // The Meta settings page shows `error` as text; give it the plain version.
  if (!returnTo) {
    const p = explainMetaConnect(code, { returnTo: "/dashboard/meta", missing: extra.missing });
    url.searchParams.set("error", `${p.title}. ${p.message}`);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  const cookieStore = await cookies();
  const returnTo = safeReturnTo(cookieStore.get(RETURN_COOKIE)?.value);
  cookieStore.delete(RETURN_COOKIE);

  // Facebook sends these when the person closed the window or said no.
  const metaError = req.nextUrl.searchParams.get("error");
  const errorReason = req.nextUrl.searchParams.get("error_reason");
  const description = req.nextUrl.searchParams.get("error_description");
  if (metaError || description) {
    return failed(origin, returnTo, classifyMetaConnect({ error: metaError, errorReason, description }), { technical: description });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
  if (!code || !state || !expectedState || expectedState !== state) {
    return failed(origin, returnTo, "link_expired");
  }

  const [organizationId] = state.split(".");

  // The organization in the state has to be one this session may actually act
  // on. Comparing it against the session's own organization was right when
  // everyone had exactly one — but a freelancer connecting Meta for a client
  // carries that CLIENT's id in the state while their session holds the
  // workspace, so the old check refused every connection they tried to make.
  //
  // The state itself is already proven genuine by the cookie comparison above;
  // this is the separate question of whether it belongs to the caller.
  const permitted = await activeOrganizationId();
  if (!organizationId || organizationId !== permitted) {
    return failed(origin, returnTo, "wrong_account");
  }

  try {
    const result = await completeMetaConnection(organizationId, code);
    if (!result.ok) return failed(origin, returnTo, result.code, { missing: result.missing, technical: result.technical });

    // A real connection makes "looking around first" moot — drop the flag so
    // the not-connected banner disappears and the funnel is back to normal.
    await stopExploring();

    // Back to where they started — the campaign they were planning picks up
    // where it left off. An ad account that can't spend, or no Page, is said
    // on arrival by the setup steps rather than left for later.
    const url = new URL(returnTo ?? "/dashboard/meta", origin);
    url.searchParams.set("connected", "1");
    if (result.accountStatus !== 1) {
      url.searchParams.set("checkBilling", "1");
      url.searchParams.set("acct", String(result.accountStatus));
    }
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect to Meta.";
    console.error("Meta connection failed:", message);
    return failed(origin, returnTo, classifyMetaConnect({ message }), { technical: message });
  }
}
