"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// The moment after paying.
//
// Someone has just put real money down on a tool they have never used, and the
// next thirty seconds decide whether they open it again tomorrow. So this does
// two things: it tells them the payment landed, and it tells them exactly what
// to do first — because "now what?" is what kills a new subscription.
//
// On the copy: it is deliberately confident without promising anyone money.
// Advertising results depend on the business, the offer and the budget, none
// of which MAIRO controls, and a promise made here is one a freelancer will
// quote back when a campaign has a bad month. Energy, not earnings.

const STORAGE_KEY = "mairo.welcome.freelancer";

/**
 * Whether this has already been dismissed, read from localStorage.
 *
 * useSyncExternalStore rather than an effect: localStorage does not exist
 * during server rendering, and setting state from an effect to work around
 * that is both a lint error and a flash of the wrong thing. The server
 * snapshot says "dismissed", so nothing renders server-side, and the client
 * settles on the real answer as it hydrates.
 */
function useDismissed(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      return () => window.removeEventListener("storage", onChange);
    },
    () => {
      try {
        return localStorage.getItem(STORAGE_KEY) !== null;
      } catch {
        // Private browsing: show it. Dismissing just will not stick.
        return false;
      }
    },
    () => true
  );
}

export function Welcome({ planName, clientLimit }: { planName: string; clientLimit: number }) {
  const dismissed = useDismissed();
  const [closedNow, setClosedNow] = useState(false);
  const open = !dismissed && !closedNow;

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "seen");
    } catch {
      /* nothing to remember it with */
    }
    setClosedNow(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to MAIRO"
      className="fixed inset-0 z-50 flex items-center justify-center px-5"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />

      <div
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-white/[0.1] bg-neutral-950 p-8 sm:p-10"
        style={{ animation: "welcome-in 0.5s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(150,110,255,0.28),transparent_70%)]"
        />

        <p className="relative text-[11px] uppercase tracking-[0.32em] text-neutral-500">
          You&apos;re in
        </p>
        <h2 className="relative mt-4 text-3xl font-light leading-[1.1] tracking-[-0.02em] sm:text-4xl">
          Let&apos;s go build
          <br />
          some campaigns.
        </h2>
        <p className="relative mt-5 text-sm leading-relaxed text-neutral-400">
          You&apos;re on <span className="text-white">{planName}</span> — room for{" "}
          <span className="text-white">{clientLimit} client businesses</span>, each with its
          own ad account, campaigns and creatives. Here&apos;s the whole job:
        </p>

        <ol className="relative mt-7 space-y-3.5 text-sm text-neutral-300">
          {[
            "Add a client and tell MAIRO what they sell",
            "Connect their Meta ad account",
            "Let it write the plan and the creative",
            "You approve — it builds the campaigns, paused",
          ].map((step, i) => (
            <li key={step} className="flex gap-4">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 text-[10px] text-neutral-400">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={close}
          className="relative mt-9 w-full rounded-full bg-white px-6 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-black transition hover:bg-neutral-200"
        >
          Add my first client
        </button>

        <style>{`
          @keyframes welcome-in {
            from { opacity: 0; transform: translate3d(0, 18px, 0) scale(0.98); }
            to   { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
          }
        `}</style>
      </div>
    </div>
  );
}
