import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { emailConfigured } from "@/lib/email/send";
import { LEGAL } from "@/lib/legal";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset your password", description: "Get a link to choose a new MAIRO password." };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <AuthCard>
      <h1 className="mb-1 text-[22px] font-bold tracking-[-0.02em] text-white">Forgot your password?</h1>
      {emailConfigured() ? (
        <ForgotPasswordForm />
      ) : (
        // No email provider on this deployment: say how it's done instead of
        // showing a form whose link would never arrive.
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">
          Email{" "}
          <a href={`mailto:${LEGAL.contactEmail}?subject=Reset%20my%20MAIRO%20password`} className="text-white underline">
            {LEGAL.contactEmail}
          </a>{" "}
          from the address you sign in with, and we&apos;ll reset it for you.
        </p>
      )}
      <p className="mt-6 text-center text-sm text-neutral-400">
        Remembered it?{" "}
        <Link href="/sign-in" className="text-white underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
