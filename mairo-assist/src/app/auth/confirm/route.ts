import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "email_change", "invite", "magiclink"];

/**
 * Landing point for every email link (verify email, reset password, change
 * email). Supports the token-hash links recommended for server-side auth and
 * the PKCE `code` links Supabase sends by default.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  let next = safeNextPath(searchParams.get("next"), "/dashboard");
  if (type === "recovery") next = "/reset-password";

  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
  if (!isSupabaseConfigured()) return fail("not-configured");

  const supabase = await createClient();
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return fail("link-expired");
  } else if (code) {
    // PKCE links only work in the browser that started the flow. By the time
    // the user lands here Supabase has usually already confirmed the email,
    // so point them to sign in rather than calling the link expired.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail("link-other-browser");
  } else {
    return fail("link-invalid");
  }

  if (type === "email_change") next = "/account?notice=email-updated";
  return NextResponse.redirect(new URL(next, request.url));
}
