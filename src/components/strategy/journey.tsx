import Link from "next/link";
import { signOutAction } from "@/lib/actions/auth-actions";

// The one journey from sign-up to a live first campaign, shown at the top of
// every screen on the way: the free stage creates the plan, the paid stage
// activates it. Nothing here starts over.

export const JOURNEY = ["Business setup", "Your free plan", "Approve", "Activate", "Build campaign", "Launch"] as const;
export type JourneyStage = (typeof JOURNEY)[number];

export function JourneySteps({ current }: { current: JourneyStage }) {
  const at = JOURNEY.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px]" aria-label="Your progress">
      {JOURNEY.map((label, i) => {
        const done = i < at;
        const here = i === at;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={here ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                here ? "border-violet/60 bg-violet/15 text-white" : done ? "border-emerald-400/25 text-emerald-300" : "border-white/10 text-faint"
              }`}
            >
              <span aria-hidden>{done ? "✓" : i + 1}</span>
              {label}
            </span>
            {i < JOURNEY.length - 1 && <span aria-hidden className="hidden h-px w-3 bg-white/15 sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

/** The onboarding frame: no sidebar, just where they are and a way out. */
export function JourneyFrame({ current, children, wide = false }: { current: JourneyStage; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-[#060a16] text-white">
      <header className="border-b border-white/[0.06]">
        <div className={`mx-auto flex items-center justify-between gap-4 px-4 py-4 sm:px-6 ${wide ? "max-w-[1240px]" : "max-w-[1000px]"}`}>
          <Link href="/" className="text-[14px] font-light tracking-[0.3em] text-white">
            MAIRO
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="text-[12.5px] text-faint hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className={`mx-auto px-4 pb-24 pt-6 sm:px-6 ${wide ? "max-w-[1240px]" : "max-w-[1000px]"}`}>
        <JourneySteps current={current} />
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
