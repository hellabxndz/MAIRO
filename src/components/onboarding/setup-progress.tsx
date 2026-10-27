import Link from "next/link";
import { focusStep, onboardingPhases, progressCount, type OnboardingStep, type StepId, type StepState } from "@/lib/onboarding/progress";
import { ProblemCard } from "./problem-card";

// Where a business is in setup, from its records: nine phases in one bar —
// business, goal, strategy, free plan, creatives, video, account and payment,
// approval and launch, next steps — the step to do next with a button to
// continue it, and every step behind "See every step", with who does it, why
// it's asked, and a way back to anything unfinished. Saved as they go, so
// leaving and coming back picks up here.

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
  const phases = onboardingPhases(steps);
  // A page that is itself a step (choosing a plan, the launch review) is
  // described as that step, and keeps the one primary action on the page. Any
  // other open step is offered as a quiet link — never a second big button
  // sending someone who came to pay back to an earlier screen.
  const current = here ? steps.find((s) => s.id === here && s.state !== "done" && s.state !== "skipped") ?? null : null;
  const shown = current ?? focus;
  const phase = shown ? phases.find((p) => p.steps.some((s) => s.id === shown.id)) : phases[phases.length - 1];
  const open = (s: OnboardingStep | null) => Boolean(s?.href && s.id !== here && (s.state === "current" || s.state === "attention" || s.state === "todo"));
  const other = focus && focus.id !== shown?.id && open(focus) ? focus : !current && open(focus) ? focus : null;
  return (
    <nav aria-label="Your setup progress" className="rounded-2xl border border-white/[0.07] bg-field/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13.5px] text-muted">
          {shown && phase ? (
            <>
              {phase.n} of {phases.length} · {phase.label}: <span className="font-medium text-white">{shown.label}</span>
            </>
          ) : (
            <span className="font-medium text-white">Setup complete — your first campaign is live. Next steps are on your dashboard.</span>
          )}
        </p>
        <p className="text-[12px] text-faint">
          {finished} of {total} steps done · saved as you go
        </p>
      </div>
      <ol className="mt-3 grid grid-cols-9 gap-1" aria-label="Setup phases">
        {phases.map((p) => (
          <li key={p.id} aria-current={phase?.id === p.id ? "step" : undefined} className="min-w-0">
            <span aria-hidden className={`block h-1.5 rounded-full ${SEG[p.state]} ${p.steps.some((s) => s.id === here) ? "ring-2 ring-violet/50 ring-offset-1 ring-offset-transparent" : ""}`} />
            <span className={`mt-1.5 hidden truncate text-[10.5px] lg:block ${phase?.id === p.id ? "font-medium text-white" : "text-faint"}`}>{p.label}</span>
            <span className="sr-only">{p.n}. {p.label} — {MARK[p.state].sr}</span>
          </li>
        ))}
      </ol>
      {shown?.why && <p className="mt-2 text-[12.5px] text-muted">{shown.why}</p>}
      {other && (here ? (
        <p className="mt-2 text-[12.5px] text-muted">
          {current ? "Also still open: " : "Next: "}
          <Link href={other.href!} className="inline-flex min-h-11 items-center text-violet-bright underline-offset-4 hover:underline sm:pointer-fine:min-h-0">
            {other.label} →
          </Link>
        </p>
      ) : (
        <Link href={other.href!} className="mt-3 inline-flex min-h-[38px] items-center rounded-full bg-[image:var(--mairo-ramp)] px-4 text-[13px] font-medium text-black shadow-[var(--mairo-glow-key)]">
          Continue: {other.label} →
        </Link>
      ))}

      {showProblem && focus?.problem && <ProblemCard problem={focus.problem} tone={focus.state === "waiting" ? "warn" : "alert"} className="mt-3" />}

      <details className="group mt-3">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-[12.5px] text-violet-bright hover:text-white sm:pointer-fine:min-h-0">
          <span className="group-open:hidden">See every step</span>
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
                  <Link href={s.href} className="mt-1 inline-flex min-h-11 items-center sm:pointer-fine:min-h-0 text-[12px] text-violet-bright hover:text-white">
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
