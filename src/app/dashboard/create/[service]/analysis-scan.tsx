"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { AdPlatform } from "@/generated/prisma/enums";

// What MAIRO is doing while it builds the campaign.
//
// This is up for as long as createCampaignAction is running, and that action is
// genuinely doing all of this — reading what it was given, writing creative,
// working out targeting, creating the campaign on each network. So the screen
// is covering real work rather than performing it. That distinction is the
// whole reason it is acceptable: a progress display over an instant operation
// is theatre, and customers can tell.
//
// Which is also why the last line never ticks itself off. The rows advance on a
// cadence because the work has no progress events to listen to, but the screen
// only finishes when the server answers — the page navigates away. If the
// action takes longer than the rows do, the last one keeps breathing rather
// than sitting on "done" while nothing has happened yet, which is the specific
// lie most loading screens tell.
//
// Restraint is deliberate. No spinner, no bouncing dots, no percentage that is
// really a timer. One line at a time, a thin rail, and a glow on the row that
// is working.

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const PLATFORM_LABEL: Record<string, string> = {
  META: "Meta",
  TIKTOK: "TikTok",
  GOOGLE: "Google",
  SNAPCHAT: "Snapchat",
  PINTEREST: "Pinterest",
  LINKEDIN: "LinkedIn",
};

export function AnalysisScan({
  businessName,
  platforms,
}: {
  businessName: string;
  platforms: AdPlatform[];
}) {
  const reduced = usePrefersReducedMotion();
  const networks = platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(" and ");

  const lines = [
    "Reading what you're advertising",
    "Working out who buys it",
    "Choosing the campaign objective",
    "Writing your ads",
    `Building the campaign in ${networks}`,
    "Checking it before you see it",
  ];

  const [at, setAt] = useState(0);

  // Paced, not timed. Each row gets a beat; the last one holds until the
  // server navigates away, however long that takes.
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => {
      setAt((n) => (n >= lines.length - 1 ? n : n + 1));
    }, 900);
    return () => clearInterval(t);
  }, [reduced, lines.length]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center py-10">
      <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-blue-bright/85">
        MAIRO is working
      </p>
      <h1 className="mt-4 text-[24px] font-semibold tracking-[-0.02em] text-white sm:text-[28px]">
        Building your campaign for {businessName}.
      </h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
        This takes a moment. Nothing is live — you will see all of it before anything runs.
      </p>

      <ol className="relative mt-9">
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-4 left-[7px] top-4 w-px"
          style={{ background: "var(--mairo-line)" }}
        />
        {lines.map((line, i) => {
          const done = i < at;
          const working = i === at;
          return (
            <li key={line} className="relative flex items-center gap-4 py-2.5 pl-8">
              <span
                aria-hidden
                className={`absolute left-0 flex h-[15px] w-[15px] items-center justify-center rounded-full border transition-all duration-500 [transition-timing-function:var(--ease-mairo)] ${
                  done
                    ? "border-live/60 bg-live/20 text-live"
                    : working
                      ? "border-[color:var(--mairo-line-lit)] bg-blue/20"
                      : "border-[color:var(--mairo-line)]"
                } ${working && !reduced ? "mairo-scan-dot" : ""}`}
                style={{ background: done || working ? undefined : "rgba(6,10,24,0.9)" }}
              >
                {done && (
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                    <path
                      d="M2 6.2l2.6 2.6L10 3.4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span
                className={`text-[14px] transition-colors duration-500 ${
                  done ? "text-muted" : working ? "text-white" : "text-faint"
                }`}
              >
                {line}
              </span>
            </li>
          );
        })}
      </ol>

      <style>{`
        .mairo-scan-dot { animation: mairo-scan-dot 1.8s ease-in-out infinite; }
        @keyframes mairo-scan-dot {
          0%, 100% { box-shadow: 0 0 0 0 rgba(61,125,255,0.35); }
          50%      { box-shadow: 0 0 0 6px rgba(61,125,255,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .mairo-scan-dot { animation: none; }
        }
      `}</style>
    </div>
  );
}
