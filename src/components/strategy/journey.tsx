import Link from "next/link";
import { signOutAction } from "@/lib/actions/auth-actions";

// The one journey from sign-up to a live first campaign. FREE shows what
// Mairo would do — the plan, and connecting the account. PAID is Mairo doing
// it — building and launching. The bar says which side of that line they're on.

const BEFORE_PAYMENT = [
  "Tell Mairo about your business",
  "Review your free strategy",
  "Connect your ad account",
  "Choose your Mairo plan",
  "Build your campaign",
  "Launch your campaign",
] as const;

const AFTER_PAYMENT = ["Business setup", "Strategy approved", "Ad account connected", "Subscription active", "Build campaign", "Launch campaign"] as const;

/**
 * `step` is 1-based: the step they're on now. Before payment, steps 5 and 6
 * are locked. `done` marks earlier steps complete; a skipped one (connecting
 * the account later) can be left out.
 */
export function JourneySteps({ step, paid, skipped = [] }: { step: number; paid: boolean; skipped?: number[] }) {
  const labels = paid ? AFTER_PAYMENT : BEFORE_PAYMENT;
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px]" aria-label="Your progress">
      {labels.map((label, idx) => {
        const n = idx + 1;
        const here = n === step;
        const locked = !paid && n >= 5;
        const done = n < step && !skipped.includes(n);
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={here ? "step" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                here ? "border-violet/60 bg-violet/15 text-white" : done ? "border-emerald-400/25 text-emerald-300" : "border-white/10 text-faint"
              }`}
            >
              <span aria-hidden>{done ? "✓" : locked ? "🔒" : n}</span>
              {label}
              {here && <span className="sr-only"> (current)</span>}
            </span>
            {n < labels.length && <span aria-hidden className="hidden h-px w-3 bg-white/15 sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

/** The onboarding frame: no sidebar, just where they are and a way out. */
export function JourneyFrame({ step, paid = false, skipped, children, wide = false }: { step: number; paid?: boolean; skipped?: number[]; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-[#060a16] text-white">
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
        <JourneySteps step={step} paid={paid} skipped={skipped} />
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
