"use client";

import { useEffect, useState } from "react";

// What shows while a picture is actually being made.
//
// No percentage bar — there is no honest number to put on it. OpenAI does not
// report generation progress, and a bar that climbs on a timer rather than on
// real progress is a lie dressed as reassurance. What this shows instead is
// rotating, specific language and a genuine indicator that something is
// happening, which is the whole of what is actually true.
const MESSAGES = [
  "Bringing your vision to life…",
  "Creating your next advertisement…",
  "Generating your creative…",
  "Your next campaign starts here…",
];

export function GeneratingOverlay({ label = "Generating" }: { label?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % MESSAGES.length), 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex aspect-square w-full flex-col items-center justify-center gap-5 rounded-[var(--radius-panel)] border"
      style={{
        borderColor: "var(--mairo-line-lit)",
        backgroundImage:
          "radial-gradient(circle at 50% 40%, rgba(108,158,255,0.16), transparent 65%), var(--mairo-glass)",
      }}
    >
      <div className="relative h-16 w-16">
        <span
          aria-hidden
          className="mairo-spin-slow absolute inset-0 rounded-full border-2 border-dashed"
          style={{ borderColor: "rgba(122,162,255,0.35)" }}
        />
        <span
          aria-hidden
          className="mairo-spin absolute inset-2 rounded-full border-2 border-transparent"
          style={{ borderTopColor: "var(--color-sky-400, #3d7dff)", borderRightColor: "var(--color-purple-400, #a78bfa)" }}
        />
        <span
          aria-hidden
          className="mairo-pulse absolute inset-5 rounded-full"
          style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
        />
      </div>
      <p className="px-6 text-center text-[13.5px] text-white/90">{MESSAGES[index]}</p>
      <p className="text-[11px] text-faint">{label} usually takes 10–30 seconds</p>

      <style>{`
        .mairo-spin-slow { animation: mairo-spin 6s linear infinite; }
        .mairo-spin { animation: mairo-spin 1.4s linear infinite; }
        .mairo-pulse { animation: mairo-pulse-scale 2.2s ease-in-out infinite; }
        @keyframes mairo-spin { to { transform: rotate(360deg); } }
        @keyframes mairo-pulse-scale { 0%, 100% { transform: scale(0.92); opacity: 0.85; } 50% { transform: scale(1); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .mairo-spin-slow, .mairo-spin, .mairo-pulse { animation: none; }
        }
      `}</style>
    </div>
  );
}
