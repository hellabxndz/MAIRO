"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LiveDemo } from "@/components/mairo/live-demo";

// "Watch demo": opens the product walkthrough — one sentence in, a strategy,
// budget split and campaigns out — over the page, and closes on Escape or a
// click outside it. It renders into <body>, so no section's stacking context
// can draw over it.

export function WatchDemo({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-paper shadow-sm"
        >
          <svg viewBox="0 0 12 12" className="ml-0.5 h-2.5 w-2.5 fill-black">
            <path d="M2 1.2v9.6L10.5 6z" />
          </svg>
        </span>
        Watch demo
      </button>

      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mairo demo"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <div
              className="relative w-full max-w-[680px]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close demo"
                className="absolute -top-11 right-0 flex h-9 w-9 items-center justify-center rounded-full border border-[#fff]/20 bg-[#fff]/10 text-[#fff] hover:bg-[#fff]/20"
              >
                <span aria-hidden>✕</span>
              </button>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-paper shadow-[0_40px_120px_-20px_rgba(124,92,255,0.5)]">
                <LiveDemo />
              </div>
              <p className="mt-3 text-center text-[12px] text-[#fff]/70">
                A worked example of how Mairo plans a campaign — not a
                customer&rsquo;s results.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
