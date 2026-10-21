import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { resetLinkValid } from "@/lib/password-reset";
import { RESET_INVALID_MESSAGE } from "@/lib/password-reset-messages";
import { ResetPasswordForm } from "./reset-form";

// The token is in the address, so the page sends no referrer anywhere.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const valid = await resetLinkValid(token);
  return (
    <AuthCard>
      <h1 className="mb-1 text-[22px] font-bold tracking-[-0.02em] text-white">Choose a new password</h1>
      {valid ? (
        <ResetPasswordForm token={token} />
      ) : (
        <>
          <p role="alert" className="mt-3 text-sm leading-relaxed text-neutral-400">{RESET_INVALID_MESSAGE}</p>
          <Link href="/forgot-password" className="mt-6 inline-flex min-h-[46px] w-full items-center justify-center rounded-lg bg-[image:var(--mairo-ramp)] px-3 text-[15px] font-semibold text-white">
            Send me a new link
          </Link>
        </>
      )}
    </AuthCard>
  );
}
