import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Galaxy } from "@/components/galaxy";
import { ownerSetupTokenIsValid } from "@/lib/owner-setup-token";
import { SetupForm } from "./setup-form";

// This has to check the database fresh on every request (is there an OWNER
// yet?), not get baked into the static build output.
export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const ownerCount = await db.user.count({ where: { role: "OWNER" } });

  // Normally this page is first-run only and disappears once an owner exists.
  // A valid OWNER_SETUP_TOKEN reopens it as a recovery page — see
  // ownerSetupTokenIsValid for why that is safe to leave routable.
  const recovering = ownerSetupTokenIsValid(token);
  if (ownerCount > 0 && !recovering) redirect("/sign-in");

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16 text-white">
      <Galaxy />
      <div className="relative w-full max-w-sm">
        <p className="mb-8 text-center text-lg font-semibold tracking-tight">MAIRO</p>
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_0_60px_-15px_rgba(255,255,255,0.15)] backdrop-blur-xl">
          {recovering && ownerCount > 0 ? (
            <>
              <h1 className="mb-1 text-xl font-semibold">Reset owner access</h1>
              <p className="mb-6 text-sm text-neutral-400">
                This sets the password on the account you name below and makes it the
                owner. Any other owner account is demoted to a client. Remove
                OWNER_SETUP_TOKEN from your environment once you&apos;re back in.
              </p>
            </>
          ) : (
            <>
              <h1 className="mb-1 text-xl font-semibold">Create your owner account</h1>
              <p className="mb-6 text-sm text-neutral-400">
                One-time setup. This creates the account with access to the AIOS dashboard —
                once it exists, this page stops working.
              </p>
            </>
          )}
          <SetupForm token={recovering ? token : undefined} />
        </div>
      </div>
    </div>
  );
}
