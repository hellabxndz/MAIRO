"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_TARGET, ParticleStage, wakeStages, type StageTarget } from "./stage";
import { CoreFallback } from "./fallback";
import { shape } from "@/lib/cinematic/shapes";
import { ACTIVITY_EVENT, ACTIVITY_LABEL, ACTIVITY_LOOK, SETTLE_MS, type Activity, type ActivityDetail } from "@/lib/cinematic/activity";
import { deviceBudget } from "./home/director";

// The MAIRO core in the app: the same Field as the website — a ribbon of
// white lines — small, and showing what MAIRO is actually doing
// (lib/cinematic/activity.ts). The lime scan runs only while it works.
//
// At rest it shows the account's state as the page found it — calm, or a
// slow pulse when something waits for the owner. When a real operation
// reports (a review, a build in Meta, an ad being made, the assistant
// answering) it changes with it: the core speeds up, becomes an ad, or
// connects into a network; when the operation finishes it flashes once and
// settles. A short line under it says the same in words, for anyone who
// can't see the animation, and it never sits in front of anything.

const SEQ = ["ribbon", "field", "creative", "network"];

export function MairoCore({
  resting = "idle",
  size = 140,
  caption = true,
  restingLabel,
  className = "",
}: {
  /** The state when nothing is running, from the page's own data. */
  resting?: Activity;
  /** Height in pixels; the ribbon is drawn 2.5 times as wide. */
  size?: number;
  caption?: boolean;
  /** What to say at rest, e.g. "2 things waiting for you". */
  restingLabel?: string;
  className?: string;
}) {
  const [state, setState] = useState<{ activity: Activity; label?: string } | null>(null);
  const target = useRef<StageTarget>({ ...DEFAULT_TARGET, seq: SEQ, distance: 4.6, size: 0.032, pitch: 0.22, wave: 1, scan: 1 });
  const [device] = useState(() => deviceBudget("core"));
  const now = state?.activity ?? resting;

  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      const d = (e as CustomEvent<ActivityDetail>).detail;
      if (!d) return;
      if (settle) clearTimeout(settle);
      if (d.state === "idle") return setState(null);
      setState({ activity: d.state, label: d.label });
      if (d.state === "success" || d.state === "error") settle = setTimeout(() => setState(null), SETTLE_MS);
    };
    window.addEventListener(ACTIVITY_EVENT, on);
    return () => {
      window.removeEventListener(ACTIVITY_EVENT, on);
      if (settle) clearTimeout(settle);
    };
  }, []);

  useEffect(() => {
    const look = ACTIVITY_LOOK[now];
    const t = target.current;
    t.pos = SEQ.indexOf(look.shape);
    t.energy = look.energy;
    t.pulse = look.pulse;
    t.turbulence = look.turbulence;
    t.gain = look.gain * 0.75;
    t.spin = look.shape === "creative" ? 0 : look.spin * 0.4;
    // The surfaces undulate and carry the lime scan; it shows only while MAIRO works.
    t.wave = look.shape === "ribbon" || look.shape === "field" ? 1 : 0.15;
    t.scan = now === "idle" || now === "attention" ? 0.25 : 1;
    wakeStages();
  }, [now]);

  const words = state ? (state.label ?? ACTIVITY_LABEL[state.activity]) : (restingLabel ?? ACTIVITY_LABEL[resting]);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="relative max-w-full" style={{ width: size * 2.5, height: size }}>
        <ParticleStage
          target={target}
          count={device.count}
          weak={device.weak}
          pointer={false}
          className="absolute inset-0 h-full w-full"
          shapes={(n) => ({ ribbon: shape("ribbon", n), field: shape("field", n), creative: shape("creative", n), network: shape("network", n) })}
          fallback={<CoreFallback className="absolute inset-0" size={`${size * 2.5}px`} />}
        />
      </div>
      {caption && (
        <p aria-live="polite" className="mt-1 inline-flex items-center gap-2 text-center text-[12.5px] font-medium text-white/70">
          {state && state.activity !== "error" && <span aria-hidden className="v3-dot" />}
          {words}
        </p>
      )}
    </div>
  );
}
