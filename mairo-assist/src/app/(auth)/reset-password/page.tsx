import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/forms";
import { Alert } from "@/components/ui/alert";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The recovery link signs the user in with a short-lived session first.
  const user = await getSessionUser();
  return (
    <AuthCard title="Choose a new password" subtitle={user ? `For ${user.email}` : undefined}>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <Alert tone="warning" title="This reset link has expired">
          <Link href="/forgot-password" className="text-fg underline">Request a new link</Link> to reset your password.
        </Alert>
      )}
    </AuthCard>
  );
}
