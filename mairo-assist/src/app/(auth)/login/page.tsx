import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard, ConfigNotice } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/alert";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "link-expired": "That link has expired or was already used. Request a new one.",
  "link-invalid": "That link isn't valid.",
  "not-configured": "Accounts aren't available on this deployment yet.",
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
      <SignInForm next={next} />
    </AuthCard>
  );
}
