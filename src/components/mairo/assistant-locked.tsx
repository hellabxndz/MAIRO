"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OPEN_ASSISTANT_EVENT } from "./assistant";

// What "Ask MAIRO" (and ⌘K / Ctrl+K) opens when the business's plan doesn't
// include the assistant: why, and how to get it. Without this the button was
// shown but nothing listened for it, so a click did nothing at all.
export function AssistantLocked({ name }: { name: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-locked-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] rounded-[24px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink-2)] p-6"
      >
        <p className="v3-label">Ask {name}</p>
        <h2 id="assistant-locked-title" className="mt-3 text-[20px] font-semibold tracking-[-0.02em] text-white">
          {name} comes with a MAIRO plan
        </h2>
        <p className="mt-2 text-[14.5px] leading-relaxed text-white/70">
          Your business doesn&rsquo;t have an active plan right now, so {name} can&rsquo;t answer yet. Choose a plan — Pro starts with a free trial — and {name} opens straight away.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/dashboard/billing" onClick={() => setOpen(false)} className="cine-cta inline-flex min-h-11 items-center rounded-full px-5 text-[14px] font-semibold">
            Choose a plan
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--v3-line-strong)] px-5 text-[14px] text-white/85">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
