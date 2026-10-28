// Where something is in its life, as a line of stages: done ones ticked, the
// current one marked, the rest ahead and dashed. Each stage carries the date
// it happened from real records — the caller decides what's done, this only
// draws it. Horizontal from tablet up, a vertical list on a phone, an ordered
// list for screen readers.

export type Stage = { id: string; label: string; state: "done" | "current" | "upcoming" | "problem"; when?: string | null; note?: string | null };

export function StageTimeline({ stages, summary }: { stages: Stage[]; summary?: string | null }) {
  const n = Math.max(stages.length, 1);
  const at = stages.findIndex((s) => s.state === "current" || s.state === "problem");
  const reached = at === -1 ? stages.filter((s) => s.state === "done").length - 1 : at;
  const pct = n > 1 ? Math.max(0, reached) / (n - 1) : 0;
  const half = `calc(100% / ${n} / 2)`;
  return (
    <div>
      <div className="relative">
        <div aria-hidden className="absolute bottom-3 left-[11px] top-3 w-px sm:hidden" style={{ background: "var(--mairo-line)" }} />
        <div aria-hidden className="absolute top-3 hidden h-px sm:block" style={{ left: half, right: half, background: "var(--mairo-line)" }} />
        <div aria-hidden className="mairo-stage-progress absolute top-3 hidden h-px sm:block" style={{ left: half, width: `calc((100% - 100% / ${n}) * ${pct})`, background: "var(--color-signal)" }} />
        <ol className="relative grid gap-4 sm:grid-flow-col sm:gap-2 sm:[grid-auto-columns:minmax(0,1fr)]">
          {stages.map((s) => (
            <li key={s.id} className="flex items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center" aria-current={s.state === "current" ? "step" : undefined}>
              <span
                aria-hidden
                className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] ${
                  s.state === "done"
                    ? "border-transparent bg-signal text-black"
                    : s.state === "current"
                      ? "mairo-stage-now border-signal bg-[rgb(var(--mairo-bg-rgb))] text-signal"
                      : s.state === "problem"
                        ? "border-[color:var(--color-alert)] bg-[rgb(var(--mairo-bg-rgb))] text-[color:var(--color-alert)]"
                        : "border-dashed border-[color:var(--mairo-line-lit)] bg-[rgb(var(--mairo-bg-rgb))]"
                }`}
              >
                {s.state === "done" ? "✓" : s.state === "problem" ? "!" : s.state === "current" ? "●" : ""}
              </span>
              <span className="min-w-0">
                <span className={`block text-[13px] ${s.state === "upcoming" ? "text-neutral-500" : "text-white"}`}>
                  {s.label}
                  <span className="sr-only">{` — ${s.state === "done" ? "done" : s.state === "current" ? "now" : s.state === "problem" ? "needs attention" : "not yet"}`}</span>
                </span>
                <span className="block text-[11.5px] text-neutral-500">{s.when ?? (s.state === "upcoming" ? "Not yet" : "")}</span>
                {s.note && <span className={`mt-0.5 block text-[11.5px] ${s.state === "problem" ? "text-red-300" : "text-neutral-400"}`}>{s.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </div>
      {summary && (
        <p className="mt-4 flex items-start gap-2 text-[13px] text-neutral-300">
          <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
          {summary}
        </p>
      )}
    </div>
  );
}
