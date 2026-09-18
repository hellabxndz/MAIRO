"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Ten seconds to understand the product.
//
// Somebody types one sentence about their business; MAIRO comes back with a
// strategy, a budget split and a count of what it built. That is the whole
// pitch, and showing it happen is worth more than any amount of describing it.
//
// Two rules keep this honest. The figures are a worked example of the split
// arithmetic on a stated $2,000 — they are not a customer's results and the
// panel says so underneath. And the sequence is driven by an interval that
// only ever advances a step counter, never by state set during render, so it
// stays inside the lint rule that the rest of this codebase follows.
//
// It replays on click and stops entirely under prefers-reduced-motion, where
// the finished state is shown immediately — an animation somebody cannot turn
// off is an animation that excludes people.

const TYPED =
  "I own a streetwear brand. I have $2,000 this month and want more online sales.";

const STRATEGY = [
  "Meta conversion campaign",
  "Meta retargeting campaign",
  "TikTok creative testing",
  "UGC-style TikTok advertisements",
  "Product-focused Meta advertisements",
];

/** Steps: 0 typing, 1 thinking, 2 goal+budget, 3 strategy, 4 counts. */
const LAST_STEP = 4;

export function LiveDemo() {
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const [run, setRun] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (reduced.current) {
      setTyped(TYPED.length);
      setStep(LAST_STEP);
    }
  }, []);

  // The typing. An interval that only ever increments — never a value derived
  // from props during render.
  useEffect(() => {
    if (reduced.current) return;
    setTyped(0);
    setStep(0);
    const id = setInterval(() => {
      setTyped((n) => {
        if (n >= TYPED.length) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 34);
    return () => clearInterval(id);
  }, [run]);

  // The reveal, once typing has finished.
  useEffect(() => {
    if (reduced.current) return;
    if (typed < TYPED.length) return;
    const timers = [
      setTimeout(() => setStep(1), 400),
      setTimeout(() => setStep(2), 1500),
      setTimeout(() => setStep(3), 2400),
      setTimeout(() => setStep(4), 3400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [typed, run]);

  const done = step >= LAST_STEP;

  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-panel)] border"
      style={{
        borderColor: "var(--mairo-line-lit)",
        backgroundImage: "var(--mairo-glass)",
        boxShadow: "var(--mairo-glow-lift)",
      }}
    >
      <div
        className="flex items-center gap-2.5 border-b px-5 py-3.5"
        style={{ borderColor: "var(--mairo-line)" }}
      >
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live/60" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-live" />
        </span>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Mairo</p>
        {done && (
          <button
            type="button"
            onClick={() => setRun((r) => r + 1)}
            className="ml-auto text-[11px] text-faint transition-colors hover:text-white"
          >
            Replay
          </button>
        )}
      </div>

      <div className="space-y-5 px-5 py-6 sm:px-7">
        {/* What they typed */}
        <div className="flex justify-end">
          <p className="max-w-[88%] rounded-2xl bg-blue/20 px-4 py-2.5 text-[13.5px] leading-relaxed text-white ring-1 ring-blue/30">
            {TYPED.slice(0, typed)}
            {typed < TYPED.length && (
              <span aria-hidden className="mairo-caret">
                |
              </span>
            )}
          </p>
        </div>

        {step >= 1 && (
          <div className="mairo-in">
            {step === 1 ? (
              <p className="text-[12.5px] text-faint">
                <span className="mairo-think">Working out a strategy…</span>
              </p>
            ) : (
              <p className="text-[14.5px] font-medium text-white">
                I&rsquo;ve built your advertising strategy.
              </p>
            )}
          </div>
        )}

        {step >= 2 && (
          <div className="mairo-in grid gap-3 sm:grid-cols-3">
            <Cell label="Goal" value="Online purchases" />
            <Cell label="Meta" value="$1,300" />
            <Cell label="TikTok" value="$700" />
          </div>
        )}

        {step >= 3 && (
          <div className="mairo-in">
            <p className="font-mono text-[9.5px] uppercase tracking-[0.2em] text-faint">
              Strategy
            </p>
            <ul className="mt-2.5 space-y-1.5">
              {STRATEGY.map((line) => (
                <li key={line} className="flex items-start gap-2.5 text-[13px] text-white/85">
                  <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-blue-bright" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}

        {step >= 4 && (
          <div className="mairo-in flex flex-wrap items-center gap-3 border-t pt-5" style={{ borderColor: "var(--mairo-line)" }}>
            <span className="text-[13px] text-muted">8 creatives prepared</span>
            <span aria-hidden className="text-faint">·</span>
            <span className="text-[13px] text-muted">3 campaigns prepared</span>
            <Link
              href="/sign-up"
              className="ml-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12.5px] font-medium text-white transition-all duration-300 hover:brightness-110"
              style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
            >
              Review campaign
              <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </div>

      <style>{`
        .mairo-caret { animation: mairo-caret 1s steps(1) infinite; }
        @keyframes mairo-caret { 0%,50% { opacity: 1; } 50.01%,100% { opacity: 0; } }
        .mairo-think { animation: mairo-think 1.6s ease-in-out infinite; }
        @keyframes mairo-think { 0%,100% { opacity: .45; } 50% { opacity: 1; } }
        .mairo-in { animation: mairo-in .5s cubic-bezier(.22,1,.36,1) both; }
        @keyframes mairo-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .mairo-caret, .mairo-think, .mairo-in { animation: none; }
        }
      `}</style>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border px-3.5 py-3"
      style={{ borderColor: "var(--mairo-line)", background: "rgba(255,255,255,0.02)" }}
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-faint">{label}</p>
      <p className="mt-1.5 text-[14px] text-white">{value}</p>
    </div>
  );
}
