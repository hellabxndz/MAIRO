import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { AuthCard } from "@/components/auth-card";
import { inviteFor } from "@/lib/members/store";
import { ROLE_LABEL, ROLE_SUMMARY } from "@/lib/members/roles";
import { signOutAction } from "@/lib/actions/auth-actions";
import { AcceptInvite, JoinForm } from "./invite-forms";

// An invitation link: which business, which role, and for which address.
// Signed in with that address → accept. Signed in as someone else → say so.
// Not signed in → create a login that joins this business (no business of
// its own), or sign in and come back here.

export const metadata: Metadata = { title: "Join a team — MAIRO", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invite, session] = await Promise.all([inviteFor(token), auth()]);

  if (!invite || invite.state !== "open") {
    const why = !invite ? "This invitation link isn't valid. Check you copied all of it." : invite.state === "expired" ? "This invitation has expired. Ask whoever sent it for a new one." : invite.state === "used" ? "This invitation has already been used." : "This invitation was withdrawn.";
    return (
      <AuthCard>
        <h1 className="text-[20px] font-bold tracking-[-0.02em] text-white">This invitation can&rsquo;t be used</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-neutral-400">{why}</p>
        <Link href="/sign-in" className="mt-6 inline-block text-[14px] text-violet-300 underline-offset-4 hover:underline">Sign in</Link>
      </AuthCard>
    );
  }

  const signedInAs = session?.user?.email?.toLowerCase() ?? null;
  const header = (
    <>
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-300">Team invitation</p>
      <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-white">Join {invite.organization.name} on MAIRO</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-neutral-400">
        You&rsquo;re invited as <span className="font-medium text-white">{ROLE_LABEL[invite.role]}</span>: {ROLE_SUMMARY[invite.role]}
      </p>
      <p className="mt-1 text-[13px] text-neutral-500">For {invite.email} · until {invite.expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</p>
    </>
  );

  return (
    <AuthCard>
      {header}
      {signedInAs === invite.email ? (
        <AcceptInvite token={token} business={invite.organization.name} />
      ) : signedInAs ? (
        <div className="mt-6 space-y-4">
          <p className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-[13.5px] leading-relaxed text-neutral-300">
            You&rsquo;re signed in as {signedInAs}. This invitation is for {invite.email} — sign out, then open this link again and sign in with that address.
          </p>
          <form action={signOutAction}>
            <button type="submit" className="min-h-[44px] w-full rounded-lg border border-white/15 px-3 text-[14px] text-white hover:bg-white/[0.05]">Sign out</button>
          </form>
        </div>
      ) : (
        <>
          <JoinForm token={token} email={invite.email} />
          <p className="mt-5 text-center text-[13px] text-neutral-400">
            Already use MAIRO with {invite.email}?{" "}
            <Link href={`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`} className="text-violet-300 underline-offset-4 hover:underline">Sign in to accept</Link>
          </p>
        </>
      )}
    </AuthCard>
  );
}
