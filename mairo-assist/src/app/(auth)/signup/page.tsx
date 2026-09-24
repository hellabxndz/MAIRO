import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard, ConfigNotice } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/forms";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { isGoogleAuthEnabled, isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Create your account" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <AuthCard
      title="Hire your AI employee"
      subtitle="Create your account — setup takes about five minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-medium text-fg hover:underline">Sign in</Link>
        </>
      }
    >
      {!isSupabaseConfigured() && <ConfigNotice />}
      {isGoogleAuthEnabled() && (
        <>
          <GoogleButton next={next} />
          <OrDivider />
        </>
      )}
      <SignUpForm next={next} />
    </AuthCard>
  );
}
