"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { actionClass } from "./action-styles";

// Modals and drawers: simple actions stay where the customer is.
//
// Change goal, tell MAIRO something, review a creative, read why an insight
// matters — none of these deserve a trip to another page. A modal is for a
// short task; a drawer (a side panel on desktop, a bottom sheet on a phone) is
// for looking at something in more detail. Escape closes either, focus moves
// into it and back out, and the page behind can't scroll.

function useOverlay(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  // The latest onClose, without re-running the effect (and re-focusing) on every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the first thing worth focusing, after paint.
    const t = window.setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>("textarea, input, select, button, a[href]");
      (el ?? ref.current)?.focus();
    }, 20);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      window.clearTimeout(t);
      before?.focus?.();
    };
  }, [open]);
  return ref;
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useOverlay(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className={`relative max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border p-5 outline-none sm:rounded-3xl sm:p-7 ${wide ? "sm:max-w-[860px]" : "sm:max-w-[560px]"}`}
        style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(var(--mairo-bg-rgb),0.98)", boxShadow: "var(--mairo-glow-soft)" }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={id} className="text-[18px] font-semibold text-white">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useOverlay(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/55" onClick={onClose} aria-hidden />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl border-t p-5 outline-none sm:p-6 lg:inset-y-0 lg:left-auto lg:right-0 lg:max-h-none lg:w-[480px] lg:rounded-none lg:border-l lg:border-t-0"
        style={{ borderColor: "var(--mairo-line-lit)", background: "rgba(var(--mairo-bg-rgb),0.99)" }}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={id} className="text-[18px] font-semibold text-white">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        {children}
      </aside>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/[0.06] hover:text-white">
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M5 5l10 10M15 5L5 15" />
      </svg>
    </button>
  );
}

/**
 * A button that opens a drawer. The content can be server-rendered: it's
 * passed in as children and only shown once opened.
 */
export function DrawerButton({ label, title, children, className }: { label: ReactNode; title: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className ?? actionClass}>{label}</button>
      <Drawer open={open} onClose={() => setOpen(false)} title={title}>{children}</Drawer>
    </>
  );
}
