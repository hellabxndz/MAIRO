import Link from "next/link";
import { signOutAction } from "@/lib/actions/auth-actions";
import { auth } from "@/lib/auth";
import { workspacesOf } from "@/lib/members/workspace";
import { WorkspaceSwitcher } from "@/components/mairo/workspace-switcher";
import { SetupProgress } from "@/components/onboarding/setup-progress";
import type { OnboardingStep, StepId } from "@/lib/onboarding/progress";

// The one journey from sign-up to a live first campaign, in nine phases read
// from the records (lib/onboarding/progress). FREE shows what MAIRO would do
// — the plan, and connecting the account. PAID is MAIRO doing it — building
// and launching.

/**
 * The business switcher, for someone on more than one business — a MAIRO
 * Scale owner setting up an added business must be able to get back to the
 * first without finishing. Renders nothing for everyone else.
 */
async function JourneySwitcher() {
  const session = await auth().catch(() => null);
  if (!session?.user?.id || !session.user.organizationId) return null;
  const workspaces = await workspacesOf(session.user.id).catch(() => []);
  if (workspaces.length < 2) return null;
  return (
    <div className="w-[180px] max-w-[45vw]">
      <WorkspaceSwitcher workspaces={workspaces} current={session.user.organizationId} compact />
    </div>
  );
}

/** The onboarding frame: no sidebar, just where they are and a way out. */
export function JourneyFrame({ steps, here, showProblem, children, wide = false }: { steps: OnboardingStep[] | null; here?: StepId; showProblem?: boolean; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-paper text-white">
      <header className="border-b border-white/[0.06]">
        <div className={`mx-auto flex items-center justify-between gap-4 px-4 py-4 sm:px-6 ${wide ? "max-w-[1240px]" : "max-w-[1000px]"}`}>
          <Link href="/" className="inline-flex min-h-11 items-center sm:min-h-0 text-[14px] font-light tracking-[0.3em] text-white">
            MAIRO
          </Link>
          <div className="flex items-center gap-4">
            <JourneySwitcher />
            <Link href="/dashboard" className="inline-flex min-h-11 items-center sm:min-h-0 text-[12.5px] text-faint hover:text-white">
              My account
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="inline-flex min-h-11 items-center sm:min-h-0 text-[12.5px] text-faint hover:text-white">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className={`mx-auto px-4 pb-24 pt-6 sm:px-6 ${wide ? "max-w-[1240px]" : "max-w-[1000px]"}`}>
        {steps && <SetupProgress steps={steps} here={here} showProblem={showProblem} />}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
