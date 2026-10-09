import Link from "next/link";
import { signOutAction } from "@/lib/actions/auth-actions";
import { SetupProgress } from "@/components/onboarding/setup-progress";
import type { OnboardingStep, StepId } from "@/lib/onboarding/progress";

// The one journey from sign-up to a live first campaign, in ten steps read
// from the records (lib/onboarding/progress). FREE shows what Mairo would do
// — the plan, and connecting the account. PAID is Mairo doing it — building
// and launching.

/** The onboarding frame: no sidebar, just where they are and a way out. */
export function JourneyFrame({ steps, here, showProblem, children, wide = false }: { steps: OnboardingStep[] | null; here?: StepId; showProblem?: boolean; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-paper text-white">
      <header className="border-b border-white/[0.06]">
        <div className={`mx-auto flex items-center justify-between gap-4 px-4 py-4 sm:px-6 ${wide ? "max-w-[1240px]" : "max-w-[1000px]"}`}>
          <Link href="/" className="text-[14px] font-light tracking-[0.3em] text-white">
            MAIRO
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-[12.5px] text-faint hover:text-white">
              My account
            </Link>
            <form action={signOutAction}>
              <button type="submit" className="text-[12.5px] text-faint hover:text-white">
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
