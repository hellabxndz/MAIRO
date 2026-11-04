"use client";

import { useEffect, useRef, useState } from "react";

// "One MAIRO", shown: a business owner asks for more customers, and MAIRO —
// one AI that already knows the business — answers from its figures, says
// what it doesn't know, and prepares a change that waits for a yes. It plays
// once as it scrolls into view (all at once under reduced motion).
//
// An example for a fictional business, labelled as one; the figures are
// sample figures and the buttons do nothing. What it promises is what the
// product does: answers from records, recommendations that wait for
// approval, the business's own rules (the 20-mile radius) respected.


export function AskMairoScene() {
  const ref = useRef<HTMLElement>(null);
  // Plays once in view. Under reduced motion every beat shows at once, in CSS
  // (.v3-beat in globals.css), so server and browser render the same thing.
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        [0, 700, 1900, 2900, 3900, 4800].forEach((ms, i) => timers.push(setTimeout(() => setBeat(i + 1), ms)));
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  const on = (n: number) => `v3-beat transition-all duration-700 [transition-timing-function:var(--ease-mairo)] ${beat >= n ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`;

  return (
    <section ref={ref} id="one-mairo" aria-labelledby="one-mairo-title" className="relative bg-[color:var(--v3-ink)] py-[clamp(96px,14vw,200px)]">
      <div className="mx-auto grid w-full max-w-[1320px] gap-12 px-5 sm:px-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16 lg:px-16">
        <div>
          <p data-reveal className="v3-label">One AI · one conversation</p>
          <h2 id="one-mairo-title" data-reveal className="v3-display mt-5 text-[clamp(40px,6vw,96px)] text-white">
            Say what you want<span className="v3-signal">.</span>
          </h2>
          <p data-reveal className="mt-6 max-w-[460px] text-[clamp(16px,1.3vw,18px)] leading-relaxed text-[color:var(--v3-text-2)]">
            One MAIRO that knows your business, remembers what you told it and reads your real results. It does the work, and asks before anything spends.
          </p>
          <ul data-reveal className="mt-8 space-y-3 border-t border-[color:var(--v3-line)] pt-6 text-[15px] text-white/80">
            {["Remembers your area, budget and rules", "Answers from your Meta figures — and says what it doesn't know", "Prepares the change; you approve it"].map((x) => (
              <li key={x} className="flex gap-3">
                <span aria-hidden className="mt-[0.62em] h-px w-3 shrink-0 bg-white/40" />
                {x}
              </li>
            ))}
          </ul>
        </div>

        {/* The scene: a MAIRO window, framed like the product. */}
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute -inset-px rounded-[30px] bg-[linear-gradient(140deg,rgba(255,255,255,0.22),rgba(255,255,255,0.02)_40%,rgba(212,255,58,0.18)_100%)]" />
          <div className="relative overflow-hidden rounded-[30px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink-2)]">
            <div className="flex items-center justify-between border-b border-[color:var(--v3-line)] px-5 py-3.5">
              <p className="flex items-center gap-2.5 text-[13.5px] font-medium text-white">
                <span aria-hidden className={`v3-dot ${beat >= 2 && beat < 4 ? "v3-breathe" : ""}`} />
                MAIRO
              </p>
              <p className="v3-label !text-[10.5px]">Example · fictional business</p>
            </div>
            <div className="space-y-4 p-5 sm:p-7" aria-live="off">
              <div className={`flex justify-end ${on(1)}`}>
                <p className="max-w-[80%] rounded-[20px] rounded-br-md bg-white px-4 py-2.5 text-[15px] text-black">I want more customers.</p>
              </div>
              <div className={`v3-beat-typing ${on(2)} ${beat >= 3 ? "hidden" : ""}`}>
                <span className="inline-flex gap-1 rounded-full border border-[color:var(--v3-line)] px-3 py-2" aria-label="MAIRO is thinking">
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="v3-typing h-1.5 w-1.5 rounded-full bg-white/60" style={{ animationDelay: `${d * 140}ms` }} />
                  ))}
                </span>
              </div>
              <div className={`max-w-[92%] space-y-2 text-[15px] leading-relaxed text-white/90 ${on(3)}`}>
                <p>Your cost per lead rose from $21 to $26 over the last two weeks, mostly on &ldquo;Spring cleanups&rdquo;. People are clicking less — the same ad has run for five weeks.</p>
                <p className="text-white/60">I can&rsquo;t see your bookings yet, so I&rsquo;m judging by leads, not jobs won.</p>
              </div>
              <div className={`rounded-[20px] border border-[color:var(--v3-line-strong)] p-4 ${on(4)}`}>
                <p className="v3-label !text-[10.5px]">Prepared for your approval</p>
                <p className="mt-2 text-[16px] font-semibold text-white">A fresh ad for &ldquo;Spring cleanups&rdquo;</p>
                <p className="mt-1 text-[13.5px] text-white/60">Runs beside the current one for a fair test · within your 20-mile area · no extra spend</p>
                <div className="mt-4 flex flex-wrap gap-2" inert>
                  <span className="inline-flex min-h-10 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-black">Approve</span>
                  <span className="inline-flex min-h-10 items-center rounded-full border border-[color:var(--v3-line-strong)] px-5 text-[14px] text-white/80">Show me the ad</span>
                </div>
              </div>
              <div className={`flex flex-wrap gap-2 ${on(5)}`}>
                {["Tracking: working", "Budget: $40/day of $60 max", "Autopilot: paused"].map((c, i) => (
                  <span key={c} className="inline-flex items-center gap-2 rounded-full border border-[color:var(--v3-line)] px-3 py-1.5 text-[12.5px] text-white/70">
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${i === 0 ? "bg-[color:var(--v3-signal)]" : "bg-white/40"}`} />
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className={`border-t border-[color:var(--v3-line)] px-5 py-3.5 ${on(6)}`}>
              <p className="flex items-center justify-between rounded-full border border-[color:var(--v3-line)] px-4 py-2.5 text-[14px] text-white/35">
                Ask MAIRO anything…
                <kbd className="rounded-md border border-[color:var(--v3-line)] px-1.5 font-mono text-[10.5px] text-white/45">⌘K</kbd>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
