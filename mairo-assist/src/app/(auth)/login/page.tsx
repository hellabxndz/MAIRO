import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard, ConfigNotice } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/alert";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { isGoogleAuthEnabled, isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "link-expired": "That link has expired or was already used. Request a new one.",
  "link-other-browser":
    "We couldn't finish signing you in from that link — this happens when it's opened in a different browser or app than the one you signed up in. If you just confirmed your email, it's done: sign in below.",
  "link-invalid": "That link isn't valid.",
  "not-configured": "Accounts aren't available on this deployment yet.",
  "oauth-cancelled": "Google sign-in was cancelled. You can try again or use your email.",
  "oauth-failed": "We couldn't sign you in with Google. Please try again, or use your email and password.",
  "oauth-unavailable": "Signing in with Google isn't available yet. Use your email and password.",
  "too-many": "Too many attempts. Please wait a few minutes and try again.",
};
const NOTICES: Record<string, string> = {
  "signed-out": "You've been signed out.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  const notice = typeof sp.notice === "string" ? NOTICES[sp.notice] : undefined;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to check in on your AI employee."
      footer={
        <>
          New to Mairo Assist?{" "}
          <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-medium text-fg hover:underline">Create an account</Link>
        </>
      }
    >
      {!isSupabaseConfigured() && <ConfigNotice />}
      {error && <Alert tone="danger" className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}
      {isGoogleAuthEnabled() && (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      )}
      <SignInForm next={next} />
    </AuthCard>
  );
}
