import Link from "next/link";
import type { MemoryProfile } from "@/lib/memory/profile";
import { GlassPanel, HudLabel } from "@/components/mairo";

// How much MAIRO has to work with.
//
// The tempting version of this card is a set of bars that fill up and make
// somebody feel good. The useful version tells them which bar is low and what
// to do about it — so every area expands into the individual things MAIRO is
// looking for, ticked or not, with a link where the answer can be given.
//
// Two of the areas cannot be filled in by answering anything. Creative
// learning needs ads that ran; history needs months. Those are said plainly
// rather than dressed up as a task, because a card that nags somebody to
// complete something impossible is worse than one that admits time is the only
// input left.

function barColour(percent: number): string {
  if (percent >= 70) return "rgb(52,211,153)";
  if (percent >= 35) return "var(--color-blue-bright, #6c9eff)";
  return "rgb(251,191,36)";
}

export function MemoryPanel({
  profile,
  assistantName,
  className = "",
}: {
  profile: MemoryProfile;
  assistantName: string;
  className?: string;
}) {
  return (
    <GlassPanel className={`p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <HudLabel className="mb-3">Mairo memory</HudLabel>
          <h2 className="text-[16px] font-medium text-white">
            {assistantName} is learning your business
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
            The more it knows, the more its recommendations are about you rather than about
            advertising in general. Nothing here is a score of your business — it is how much
            {" "}{assistantName} has to work with.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[26px] font-medium leading-none text-white">{profile.overall}%</p>
          <p className="mt-1.5 text-[11px] text-faint">Overall</p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {profile.scores.map((score) => (
          <details key={score.area} className="group">
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[13px] text-white">{score.label}</span>
                <span className="flex items-center gap-2.5">
                  <span className="font-mono text-[11.5px] text-muted">{score.percent}%</span>
                  <svg
                    viewBox="0 0 12 12"
                    className="h-3 w-3 text-faint transition-transform duration-300 group-open:rotate-180"
                    fill="none"
                    aria-hidden
                  >
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </span>
              </div>
              <div
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-700 [transition-timing-function:var(--ease-mairo)]"
                  style={{ width: `${score.percent}%`, background: barColour(score.percent) }}
                />
              </div>
            </summary>

            <div className="mt-3 pl-0.5">
              <p className="max-w-2xl text-[12px] leading-relaxed text-faint">{score.summary}</p>
              <ul className="mt-3 space-y-1.5">
                {score.signals.map((signal) => (
                  <li key={signal.label} className="flex items-start gap-2.5 text-[12.5px]">
                    <span
                      aria-hidden
                      className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${
                        signal.known ? "bg-live" : "bg-white/20"
                      }`}
                    />
                    {signal.known ? (
                      <span className="text-muted">{signal.label}</span>
                    ) : signal.href ? (
                      <Link
                        href={signal.href}
                        className="text-faint underline-offset-4 transition-colors hover:text-white hover:underline"
                      >
                        {signal.label}
                      </Link>
                    ) : (
                      // No link means only time or advertising fills this in.
                      // Saying so beats a dead link that implies otherwise.
                      <span className="text-faint">
                        {signal.label} <span className="text-white/25">· comes with time</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        ))}
      </div>

      {profile.nextStep ? (
        <div
          className="mt-6 rounded-xl border p-4"
          style={{ borderColor: "var(--mairo-line)", background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-[12px] text-faint">Most useful thing you could tell it next</p>
          <Link
            href={profile.nextStep.href}
            className="mt-1 block text-[13.5px] text-white transition-colors hover:text-blue-bright"
          >
            {profile.nextStep.label} →
          </Link>
          <p className="mt-1 text-[11.5px] leading-relaxed text-faint">{profile.nextStep.why}</p>
        </div>
      ) : (
        <p className="mt-6 text-[12.5px] leading-relaxed text-faint">
          There is nothing left to tell it. Everything else comes from advertising that has
          actually run, which only time produces.
        </p>
      )}
    </GlassPanel>
  );
}
