import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInvite } from "@/components/team/accept-invite";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const user = await getSessionUser();
  const next = `/invite/${encodeURIComponent(token)}`;

  return (
    <div className="galaxy-bg flex min-h-dvh flex-col items-center px-4 py-8">
      <Logo className="mb-10" />
      <div className="w-full max-w-md">
        <AuthCard
          title="You've been invited"
          subtitle="A business on Mairo Assist has invited you to help run their AI employee."
        >
          {user ? (
            <>
              <p className="mb-4 text-sm text-fg-muted">
                Signed in as <span className="text-fg">{user.email}</span>. The invitation must have been sent to this email.
              </p>
              <AcceptInvite token={token} />
            </>
          ) : (
            <div className="grid gap-3">
              <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} size="lg">Sign in to accept</ButtonLink>
              <ButtonLink href={`/signup?next=${encodeURIComponent(next)}`} size="lg" variant="secondary">Create an account</ButtonLink>
            </div>
          )}
        </AuthCard>
      </div>
    </div>
  );
}
