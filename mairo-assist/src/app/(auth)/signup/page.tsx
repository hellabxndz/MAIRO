import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard, ConfigNotice } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/forms";
import { GoogleButton, OrDivider } from "@/components/auth/google-button";
import { isPlanKey, PLANS } from "@/lib/billing/plans";
import { isGoogleAuthEnabled, isSupabaseConfigured } from "@/lib/env";
import { safeNextPath } from "@/lib/security/redirect";

export const metadata: Metadata = { title: "Create your free account" };

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  // A plan picked on the pricing page is carried to the plan step after sign-up.
  const plan = isPlanKey(sp.plan) && sp.plan !== "enterprise" ? sp.plan : null;
  const next = typeof sp.next === "string" ? safeNextPath(sp.next, "/onboarding/plan") : `/onboarding/plan${plan ? `?plan=${plan}` : ""}`;
  return (
    <AuthCard
      title="Your AI Employee Starts Here."
      subtitle="Create your free Mairo Assist account and start helping customers with AI."
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-fg hover:underline">Log in</Link>
        </>
      }
    >
      {!isSupabaseConfigured() && <ConfigNotice />}
      {plan && plan !== "free" && (
        <p className="rounded-xl border border-violet/30 bg-violet/10 px-3 py-2 text-sm text-violet-glow">
          You picked <strong>{PLANS[plan].name}</strong>. Your account starts free — you&apos;ll confirm {PLANS[plan].name} and pay only after
          setting up your business.
        </p>
      )}
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
