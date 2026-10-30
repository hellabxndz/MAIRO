"use client";

import { MairoCore } from "@/components/cinematic/core";

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
          "radial-gradient(circle at 50% 40%, rgba(238,238,238,0.16), transparent 65%), var(--mairo-glass)",
      }}
    >
      {/* The MAIRO core, shaped as an ad while one is being made — shown
          only while the request is actually running (this overlay's lifetime). */}
      <MairoCore resting="generating" caption={false} size={132} />
      <p className="px-6 text-center text-[13.5px] text-white/90">{MESSAGES[index]}</p>
      <p className="text-[11px] text-faint">{label} usually takes 10–30 seconds</p>

    </div>
  );
}
