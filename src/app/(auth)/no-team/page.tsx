import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthCard } from "@/components/auth-card";
import { signOutAction } from "@/lib/actions/auth-actions";

// Signed in, but on no business's team any more — removed, or the business
// was closed. Said plainly, instead of a sign-in form for someone who is.

export const metadata = { title: "No team — MAIRO", robots: { index: false } };

export default async function NoTeamPage() {
  const session = await auth();
  if (!session?.user) redirect("/sign-in");
  if (session.user.organizationId) redirect("/dashboard");
  return (
    <AuthCard>
      <h1 className="text-[20px] font-bold tracking-[-0.02em] text-white">You&rsquo;re not on a team</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-neutral-400">
        {session.user.email} isn&rsquo;t on any business&rsquo;s team in MAIRO now. If you should be, ask the business&rsquo;s owner or administrator for a new invitation.
      </p>
      <form action={signOutAction} className="mt-6">
        <button type="submit" className="min-h-[44px] w-full rounded-lg border border-white/15 px-3 text-[14px] text-white hover:bg-white/[0.05]">Sign out</button>
      </form>
    </AuthCard>
  );
}
