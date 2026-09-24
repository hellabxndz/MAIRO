import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { safeNextPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

/** Return point for "Continue with Google" (and any future OAuth provider). */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/dashboard");
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));

  // The user cancelled on Google's screen, or Google refused.
  const providerError = searchParams.get("error");
  if (providerError) return fail(providerError === "access_denied" ? "oauth-cancelled" : "oauth-failed");

  const code = searchParams.get("code");
  if (!code || !isSupabaseConfigured()) return fail("oauth-failed");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    log.warn("auth.oauth_exchange_failed", { code: error.code });
    return fail("oauth-failed");
  }
  return NextResponse.redirect(new URL(next, request.url));
}
