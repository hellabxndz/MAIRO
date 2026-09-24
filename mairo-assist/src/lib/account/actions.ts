"use server";

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { appUrl, supabasePublishableKey, supabaseUrl } from "@/lib/env";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, emailSchema, profileSchema } from "@/lib/validation/auth";
import { fieldErrors, str, type FormState } from "@/lib/validation/form";

export async function updateProfile(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/account");
  const parsed = profileSchema.safeParse({ fullName: str(form, "fullName") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("users").update({ full_name: parsed.data.fullName }).eq("id", user.id);
  if (error) return { message: "We couldn't save your name." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function changeEmail(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/account");
  const parsed = emailSchema.safeParse(str(form, "email"));
  if (!parsed.success) return { errors: { email: [parsed.error.issues[0]?.message ?? "Enter a valid email"] } };
  if (parsed.data === user.email) return { message: "That's already your email." };
  if (!(await rateLimit(`email-change:${user.id}`, 5, 3600))) return { message: "Too many attempts. Try again later." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${appUrl()}/auth/confirm?next=/account` },
  );
  if (error) return { message: "We couldn't start the email change. Please try again." };
  return { ok: true, message: `Check ${parsed.data} (and your current inbox) for confirmation links. Your email changes once confirmed.` };
}

export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser("/account");
  const parsed = changePasswordSchema.safeParse({
    current: str(form, "current"),
    password: str(form, "password"),
    confirm: str(form, "confirm"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  if (!(await rateLimit(`pw-change:${user.id}:${await clientKey()}`, 5, 900))) return { message: "Too many attempts. Try again later." };

  // Re-verify the current password with a throwaway client, so a hijacked
  // session alone can't change the password. The throwaway session is revoked.
  const verifier = createStatelessClient(supabaseUrl()!, supabasePublishableKey()!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({ email: user.email, password: parsed.data.current });
  if (verifyError) return { errors: { current: ["That isn't your current password."] } };
  await verifier.auth.signOut({ scope: "local" });

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { message: error.code === "same_password" ? "Choose a password you haven't used before." : "We couldn't change your password." };
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true, message: "Password changed. Your other devices were signed out." };
}

export type SessionActionResult = { ok: boolean; message: string };

export async function revokeSession(sessionId: string): Promise<SessionActionResult> {
  const user = await requireUser("/account");
  if (sessionId === user.sessionId) return { ok: false, message: "Use Sign out to end this session." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_my_session", { p_session_id: sessionId });
  if (error) return { ok: false, message: "Individual sessions can't be revoked here. Use “Sign out other devices”." };
  revalidatePath("/account");
  return data ? { ok: true, message: "Device signed out." } : { ok: false, message: "That session was already gone." };
}

export async function signOutOtherDevices(): Promise<SessionActionResult> {
  await requireUser("/account");
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) return { ok: false, message: "We couldn't sign out your other devices." };
  revalidatePath("/account");
  return { ok: true, message: "All other devices were signed out." };
}

export async function signOutEverywhere(): Promise<void> {
  await requireUser("/account");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?notice=signed-out");
}
