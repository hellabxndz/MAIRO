import Link from "next/link";
import type { Journey } from "@/lib/success/journey";

// "Your first 30 days" on the Overview: where the business is, what's next,
// and what's normal at this point. Disappears once the month is done.

export function JourneyCard({ journey, founding }: { journey: Journey; founding: boolean }) {
  const current = journey.stages.find((s) => s.state === "current");
  return (
    <section aria-labelledby="journey" className="rounded-[28px] p-6 sm:p-7" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="journey" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-bright">
          Your first 30 days{founding ? " · Founding customer" : ""}
        </h2>
        <p className="text-[12.5px] text-muted">
          Day {Math.min(journey.day, 30)} · {journey.done} of {journey.total} done
        </p>
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-5">
        {journey.stages.map((s) => (
          <li
            key={s.key}
            aria-current={s.state === "current" ? "step" : undefined}
            className={`rounded-2xl px-3 py-2.5 ${s.state === "current" ? "bg-white/[0.07] ring-1 ring-[color:var(--mairo-line-lit)]" : "bg-white/[0.025]"}`}
          >
            <p className="text-[11px] text-faint">{s.when}</p>
            <p className={`mt-0.5 text-[13px] ${s.state === "upcoming" ? "text-white/50" : "text-white"}`}>
              {s.state === "done" ? "✓ " : ""}
              {s.title}
            </p>
          </li>
        ))}
      </ol>

      {current && (
        <div className="mt-5">
          <p className="text-[13.5px] text-white/80">{current.note}</p>
          <ul className="mt-3 space-y-1.5">
            {current.items.map((i) => (
              <li key={i.label} className="flex items-center gap-2.5 text-[14px]">
                <span aria-hidden className={i.done ? "text-emerald-300" : "text-white/30"}>
                  {i.done ? "✓" : "○"}
                </span>
                {i.done ? (
                  <span className="text-white/60">{i.label}</span>
                ) : (
                  <Link href={i.href} className="text-white hover:underline">
                    {i.label}
                  </Link>
                )}
                {i.optional && !i.done && <span className="text-[12px] text-faint">· recommended</span>}
                {i.note && !i.done && <span className="text-[12px] text-faint">· {i.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {founding && (
        <p className="mt-4 text-[12.5px] text-faint">
          As a founding customer you get a direct line to the MAIRO team — use Feedback any time, and they&rsquo;ll answer personally.
        </p>
      )}
    </section>
  );
}
