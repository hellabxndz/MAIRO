"use client";

import { useState } from "react";
import Link from "next/link";
import type { TimelineStep } from "@/lib/campaigns/timeline";

// The campaign lifecycle, as a vertical list somebody can read top to bottom.
//
// The rail down the left is one element, not one per row: drawn as a gradient
// that is lit down to the current step and dim after it, so progress reads as a
// single line filling rather than as nine independent dots that happen to be
// stacked. That is the difference between "here is where it has got to" and
// "here are nine unrelated ticks".
//
// Rows expand rather than linking away. A step is a thing that happened, not a
// destination, and sending somebody to another screen to find out what "campaign
// review" meant loses their place in the only view that explains the product.
// The exception is a blocked step, which carries the one link that clears it.
//
// Motion is restrained deliberately. Exactly one row animates — the current one
// — and it pulses at four seconds, slow enough to read as "working" rather than
// as something demanding attention. Nine glowing rows would communicate nothing
// except that the page is busy.

const DOT: Record<TimelineStep["state"], string> = {
  done: "border-live/50 bg-live/15 text-live",
  current: "border-[color:var(--mairo-line-lit)] bg-blue/15 text-blue-bright",
  blocked: "border-warn/50 bg-warn/12 text-warn",
  upcoming: "border-[color:var(--mairo-line)] text-faint",
};

function Mark({ state, index }: { state: TimelineStep["state"]; index: number }) {
  if (state === "done") {
    return (
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" aria-hidden>
        <path
          d="M2.5 7.5l3 3 6-6.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (state === "current") return <span className="block h-2 w-2 rounded-full bg-current" />;
  if (state === "blocked") return <span className="text-[13px] font-medium leading-none">!</span>;
  return <span className="text-[11px] leading-none tabular-nums">{index + 1}</span>;
}

export function CampaignTimeline({ steps }: { steps: TimelineStep[] }) {
  // The step that needs reading is open to begin with. Everything else starts
  // closed, because nine expanded rows is a document rather than a timeline.
  const active = steps.find((s) => s.state === "current" || s.state === "blocked");
  const [open, setOpen] = useState<string | null>(active?.key ?? null);

  const currentIndex = steps.findIndex((s) => s.state === "current" || s.state === "blocked");
  // How far down the rail is lit. Full when everything is done.
  const litTo = currentIndex === -1 ? 100 : (currentIndex / Math.max(1, steps.length - 1)) * 100;

  return (
    <ol className="relative">
      {/* The rail. Behind the rows, inset to the centre of the markers. */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-6 left-[15px] top-4 w-px"
        style={{ background: "var(--mairo-line)" }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-[15px] top-4 w-px transition-[height] duration-700 [transition-timing-function:var(--ease-mairo)]"
        style={{
          height: `calc(${litTo}% - 1rem)`,
          backgroundImage: "linear-gradient(to bottom, rgba(52,211,153,0.7), rgba(106,166,255,0.7))",
        }}
      />

      {steps.map((step, i) => {
        const expanded = open === step.key;
        const isActive = step.state === "current" || step.state === "blocked";
        return (
          <li key={step.key} className="relative pl-11">
            <button
              type="button"
              onClick={() => setOpen(expanded ? null : step.key)}
              aria-expanded={expanded}
              className="group w-full py-3 text-left"
            >
              <span
                aria-hidden
                className={`absolute left-0 top-3.5 flex h-[31px] w-[31px] items-center justify-center rounded-full border transition-all duration-500 [transition-timing-function:var(--ease-mairo)] ${DOT[step.state]} ${
                  step.state === "current" ? "mairo-step-pulse" : ""
                }`}
                style={{ background: "rgba(6,10,24,0.9)" }}
              >
                <Mark state={step.state} index={i} />
              </span>

              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span
                    className={`block text-[14px] font-medium ${
                      step.state === "upcoming" ? "text-faint" : "text-white"
                    }`}
                  >
                    {step.title}
                  </span>
                  <span
                    className={`mt-0.5 block text-[12.5px] leading-relaxed ${
                      step.state === "upcoming" ? "text-faint" : "text-muted"
                    }`}
                  >
                    {step.summary}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`mt-1 shrink-0 text-faint transition-transform duration-300 [transition-timing-function:var(--ease-mairo)] ${
                    expanded ? "rotate-180" : ""
                  }`}
                >
                  <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                    <path
                      d="M2.5 4.5L6 8l3.5-3.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </span>
            </button>

            {/* Grid-rows rather than max-height: the row can be any length and a
                guessed max-height either clips long copy or makes short copy
                animate against empty space. */}
            <div
              className="grid transition-[grid-template-rows,opacity] duration-400 [transition-timing-function:var(--ease-mairo)]"
              style={{ gridTemplateRows: expanded ? "1fr" : "0fr", opacity: expanded ? 1 : 0 }}
            >
              <div className="overflow-hidden">
                <div className="pb-4 pr-2">
                  <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted">
                    {step.detail}
                  </p>
                  {step.action && (
                    <Link
                      href={step.action.href}
                      className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-blue-bright transition-colors hover:text-white"
                    >
                      {step.action.label}
                      <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {isActive && <span className="sr-only">Current step</span>}
          </li>
        );
      })}

      <style>{`
        .mairo-step-pulse { animation: mairo-step-pulse 4s ease-in-out infinite; }
        @keyframes mairo-step-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(61,125,255,0); }
          50%      { box-shadow: 0 0 0 5px rgba(61,125,255,0.12); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mairo-step-pulse { animation: none; }
        }
      `}</style>
    </ol>
  );
}
