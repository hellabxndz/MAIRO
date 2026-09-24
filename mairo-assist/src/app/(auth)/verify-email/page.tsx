import { MailCheck } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ResendVerificationForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email.slice(0, 320) : undefined;
  return (
    <AuthCard
      title="Check your email"
      subtitle={
        <>
          We sent a verification link{email ? <> to <span className="text-fg">{email}</span></> : null}. Click it to
          activate your account and start setting up your AI employee.
        </>
      }
      footer={<Link href="/login" className="font-medium text-fg hover:underline">Back to sign in</Link>}
    >
      <div className="mb-5 flex justify-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet/25 to-electric/25 ring-1 ring-violet/30">
          <MailCheck className="size-6 text-violet-glow" aria-hidden />
        </div>
      </div>
      <p className="mb-4 text-sm text-fg-muted">Didn&apos;t get it? Check spam, or send a new link:</p>
      <ResendVerificationForm email={email} />
    </AuthCard>
  );
}
