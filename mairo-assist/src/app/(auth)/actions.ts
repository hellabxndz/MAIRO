"use server";

import { redirect } from "next/navigation";
import { appUrl, isGoogleAuthEnabled, isSupabaseConfigured } from "@/lib/env";
import { log } from "@/lib/log";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";
import { fieldErrors, str, type FormState } from "@/lib/validation/form";

const NOT_CONFIGURED: FormState = {
  message: "Accounts are not available yet: Supabase is not configured for this deployment.",
};
const TOO_MANY: FormState = { message: "Too many attempts. Please wait a few minutes and try again." };

const SIGNUP_ERRORS: Record<string, string> = {
  weak_password: "That password is too easy to guess. Try a longer one.",
  over_email_send_rate_limit: "We can't send more verification emails right now. Please try again in an hour.",
  email_address_not_authorized: "We can't send email to that address yet. Please try again later or contact support.",
  email_address_invalid: "That email address can't be used. Please check it and try again.",
  signup_disabled: "New sign-ups are paused right now. Please try again later.",
};

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = signUpSchema.safeParse({
    fullName: str(form, "fullName"),
    email: str(form, "email"),
    password: str(form, "password"),
  });
  const values = { fullName: str(form, "fullName"), email: str(form, "email") };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  if (!(await rateLimit(`signup:${await clientKey()}`, 5, 3600))) return { ...TOO_MANY, values };

  const next = safeNextPath(str(form, "next"), "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: { full_name: parsed.data.fullName },
    },
  });
  if (error) {
    log.warn("auth.signup_failed", { code: error.code, status: error.status });
    return { message: SIGNUP_ERRORS[error.code ?? ""] ?? "We couldn't create your account. Please try again.", values };
  }
  // With email confirmation off, Supabase signs the user straight in.
  if (data.session) redirect(next);
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function signInAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const values = { email: str(form, "email") };
  const parsed = signInSchema.safeParse({ email: str(form, "email"), password: str(form, "password") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const ip = await clientKey();
  const allowed =
    (await rateLimit(`signin:ip:${ip}`, 20, 900)) && (await rateLimit(`signin:email:${parsed.data.email}`, 8, 900));
  if (!allowed) return { ...TOO_MANY, values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        message: "Please verify your email first. We can send you a new link.",
        values: { ...values, unverified: "1" },
      };
    }
    return { message: "Incorrect email or password.", values };
  }
  redirect(safeNextPath(str(form, "next")));
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = forgotPasswordSchema.safeParse({ email: str(form, "email") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { email: str(form, "email") } };
  if (!(await rateLimit(`reset:${await clientKey()}`, 5, 3600))) return TOO_MANY;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl()}/auth/confirm?next=/reset-password`,
  });
  if (error) log.warn("auth.reset_request_failed", { code: error.code });
  // Same answer whether or not the account exists (no account enumeration).
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = resetPasswordSchema.safeParse({ password: str(form, "password"), confirm: str(form, "confirm") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { message: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      message: error.code === "same_password" ? "Choose a password you haven't used before." : "We couldn't update your password. Request a new link and try again.",
    };
  }
  // Other devices keep a session that knew the old password; end them.
  await supabase.auth.signOut({ scope: "others" });
  redirect("/dashboard?notice=password-updated");
}

export async function resendVerificationAction(_prev: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = forgotPasswordSchema.safeParse({ email: str(form, "email") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (!(await rateLimit(`resend:${await clientKey()}`, 5, 3600))) return TOO_MANY;

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: { emailRedirectTo: `${appUrl()}/auth/confirm?next=/onboarding` },
  });
  if (error) log.warn("auth.resend_failed", { code: error.code });
  return { ok: true, message: "If that account still needs verifying, we've sent a new link." };
}

/**
 * Start "Continue with Google". Supabase handles the Google OAuth exchange;
 * we only ever see a one-time code at /auth/callback. Works for both sign-in
 * and sign-up: a first-time Google user gets an account automatically.
 */
export async function signInWithGoogleAction(form: FormData): Promise<void> {
  if (!isGoogleAuthEnabled()) redirect("/login?error=oauth-unavailable");
  if (!(await rateLimit(`oauth:${await clientKey()}`, 30, 900))) redirect("/login?error=too-many");
  const next = safeNextPath(str(form, "next"), "/dashboard");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${appUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data.url) {
    log.warn("auth.oauth_start_failed", { code: error?.code });
    redirect("/login?error=oauth-failed");
  }
  redirect(data.url);
}
