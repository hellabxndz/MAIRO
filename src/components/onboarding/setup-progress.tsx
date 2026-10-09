import Link from "next/link";
import { focusStep, progressCount, type OnboardingStep, type StepId, type StepState } from "@/lib/onboarding/progress";
import { ProblemCard } from "./problem-card";

// Where a business is in the ten setup steps, from its records. One bar, the
// step to do next, and every step behind "See all ten steps" — with who does
// it, why it's asked, and a way back to anything unfinished.

const SEG: Record<StepState, string> = {
  done: "bg-emerald-400/80",
  skipped: "bg-emerald-400/40",
  current: "bg-violet",
  attention: "bg-alert",
  waiting: "bg-amber-400/80",
  todo: "bg-white/10",
};

const MARK: Record<StepState, { icon: string; cls: string; sr: string }> = {
  done: { icon: "✓", cls: "border-emerald-400/40 text-emerald-300", sr: "done" },
  skipped: { icon: "–", cls: "border-emerald-400/25 text-emerald-300/80", sr: "not needed" },
  current: { icon: "", cls: "border-violet/60 bg-violet/15 text-white", sr: "next" },
  attention: { icon: "!", cls: "border-alert/50 text-alert", sr: "needs attention" },
  waiting: { icon: "…", cls: "border-amber-400/40 text-amber-300", sr: "waiting" },
  todo: { icon: "", cls: "border-white/12 text-faint", sr: "to do" },
};

export function SetupProgress({ steps, here, showProblem = true }: { steps: OnboardingStep[]; here?: StepId; showProblem?: boolean }) {
  const focus = focusStep(steps);
  const { finished, total } = progressCount(steps);
  return (
    <nav aria-label="Your setup progress" className="rounded-2xl border border-white/[0.07] bg-field/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13.5px] text-muted">
          {focus ? (
            <>
              Step {focus.n} of {total}: <span className="font-medium text-white">{focus.label}</span>
            </>
          ) : (
            <span className="font-medium text-white">Setup complete — your first campaign is live.</span>
          )}
        </p>
        <p className="text-[12px] text-faint">
          {finished} of {total} done · saved as you go
        </p>
      </div>
      <div className="mt-3 grid grid-cols-10 gap-1" aria-hidden>
        {steps.map((s) => (
          <span key={s.id} title={`${s.n}. ${s.label}`} className={`h-1.5 rounded-full ${SEG[s.state]} ${here === s.id ? "ring-2 ring-violet/50 ring-offset-1 ring-offset-transparent" : ""}`} />
        ))}
      </div>
      {focus?.why && <p className="mt-2 text-[12.5px] text-muted">{focus.why}</p>}

      {showProblem && focus?.problem && <ProblemCard problem={focus.problem} tone={focus.state === "waiting" ? "warn" : "alert"} className="mt-3" />}

      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-[12.5px] text-violet-bright hover:text-white">
          <span className="group-open:hidden">See all ten steps</span>
          <span className="hidden group-open:inline">Hide the steps</span>
        </summary>
        <ol className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.id} aria-current={focus?.id === s.id ? "step" : undefined} className="flex gap-3 rounded-xl border border-white/[0.06] p-3">
              <span aria-hidden className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${MARK[s.state].cls}`}>
                {MARK[s.state].icon || s.n}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 text-[13.5px] text-white">
                  {s.label}
                  <span className="text-[11px] text-faint">{s.who === "mairo" ? "MAIRO's team" : "You"}</span>
                  <span className="sr-only">({MARK[s.state].sr})</span>
                </span>
                <span className="mt-0.5 block text-[12px] text-muted">{s.detail ?? s.why}</span>
                {s.href && s.state !== "done" && s.state !== "skipped" && s.state !== "todo" && (
                  <Link href={s.href} className="mt-1 inline-block text-[12px] text-violet-bright hover:text-white">
                    {s.state === "attention" ? "Fix this →" : s.state === "waiting" ? "See where it is →" : "Go to this step →"}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}
