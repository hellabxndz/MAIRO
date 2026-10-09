import type { Problem } from "@/lib/onboarding/problems";

// One problem, said plainly: what happened, what's safe, and the way out.
// The original wording from Meta or Stripe sits behind "Details for support".

export function ProblemCard({ problem, tone = "alert", className = "" }: { problem: Problem; tone?: "alert" | "warn"; className?: string }) {
  const border = tone === "alert" ? "border-alert/30 bg-alert/[0.05]" : "border-amber-400/30 bg-amber-400/[0.06]";
  const links = [...(problem.fix ? [problem.fix] : []), ...(problem.also ?? [])];
  return (
    <div role="alert" className={`rounded-2xl border p-5 ${border} ${className}`} data-problem={problem.code}>
      <p className="text-[15.5px] font-semibold text-white">{problem.title}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed text-white/85">{problem.message}</p>
      <p className="mt-1.5 text-[12.5px] text-muted">{problem.kept}</p>
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {links.map((f, i) => (
            <a
              key={f.href + f.label}
              href={f.href}
              {...(f.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className={
                i === 0
                  ? "inline-flex min-h-[42px] items-center rounded-lg bg-[#7c5cff] px-5 text-[13.5px] font-medium text-white hover:brightness-110"
                  : "inline-flex min-h-[42px] items-center rounded-lg border border-white/15 px-4 text-[13px] text-white/85 hover:border-white/30"
              }
            >
              {f.label}
              {f.external ? <span aria-hidden> ↗</span> : null}
            </a>
          ))}
        </div>
      )}
      {problem.technical && (
        <details className="mt-3 text-[12px] text-faint">
          <summary className="cursor-pointer hover:text-white">Details for support</summary>
          <p className="mt-1 break-words font-mono">{problem.technical}</p>
        </details>
      )}
    </div>
  );
}
