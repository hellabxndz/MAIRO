import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmailForm, PasswordForm, ProfileForm, SessionsList, type SessionRow } from "@/components/account/account-forms";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Account" };

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireUser("/account");
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: profile }, sessionsResult, { data: authUser }] = await Promise.all([
    supabase.from("users").select("full_name, email").eq("id", user.id).single(),
    supabase.rpc("list_my_sessions"),
    supabase.auth.getUser(),
  ]);
  const providers = (authUser.user?.app_metadata?.providers as string[] | undefined) ?? ["email"];
  const hasPassword = providers.includes("email");
  const usesGoogle = providers.includes("google");

  const listed = !sessionsResult.error;
  const sessions: SessionRow[] = (sessionsResult.data ?? []).map(
    (s: { id: string; updated_at: string | null; created_at: string; user_agent: string | null; ip: string | null }) => ({
      id: s.id,
      label: describeAgent(s.user_agent),
      lastActive: formatDateTime(s.updated_at ?? s.created_at),
      current: s.id === user.sessionId,
    }),
  );

  return (
    <div className="galaxy-bg min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Logo href="/dashboard" />
        <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4" aria-hidden /> Dashboard
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 pb-16">
        <h1 className="text-2xl font-semibold tracking-tight">Account settings</h1>
        {sp.notice === "email-updated" && <Alert tone="success">Your email address was confirmed.</Alert>}
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent><ProfileForm fullName={profile?.full_name ?? ""} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Email</CardTitle></CardHeader>
          <CardContent><EmailForm email={profile?.email ?? user.email} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              {hasPassword ? "Changing it signs out your other devices." : "You sign in with Google, so there's no password to change."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasPassword ? (
              <PasswordForm />
            ) : (
              <p className="text-sm text-fg-muted">
                Want to sign in with an email and password too? Use{" "}
                <Link href="/forgot-password" className="text-fg underline">Forgot password</Link> to set one.
              </p>
            )}
            {usesGoogle && hasPassword && <p className="mt-3 text-xs text-fg-subtle">You can also sign in with Google.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>Devices currently signed in to your account.</CardDescription>
          </CardHeader>
          <CardContent><SessionsList sessions={sessions} listed={listed} /></CardContent>
        </Card>
      </main>
    </div>
  );
}
