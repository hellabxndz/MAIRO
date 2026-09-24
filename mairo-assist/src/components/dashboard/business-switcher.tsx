"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { switchBusiness } from "@/lib/dashboard/actions";
import { cn } from "@/lib/utils";

export function BusinessSwitcher({
  current,
  businesses,
}: {
  current: { id: string; name: string; roleLabel: string };
  businesses: { id: string; name: string; roleLabel: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn("flex max-w-[240px] items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-left hover:bg-white/5", pending && "opacity-60")}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet/40 to-electric/40 text-xs font-semibold">
          {current.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{current.name}</span>
          <span className="block text-[11px] text-fg-subtle">{current.roleLabel}</span>
        </span>
        <ChevronsUpDown className="ml-1 size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-2 w-64 rounded-xl border border-line bg-ink-800 p-1.5 shadow-2xl" role="listbox" aria-label="Businesses">
          {businesses.map((b) => (
            <button
              key={b.id}
              type="button"
              role="option"
              aria-selected={b.id === current.id}
              onClick={() => {
                setOpen(false);
                if (b.id !== current.id) start(() => switchBusiness(b.id));
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{b.name}</span>
                <span className="block text-[11px] text-fg-subtle">{b.roleLabel}</span>
              </span>
              {b.id === current.id && <Check className="size-4 text-violet-glow" aria-hidden />}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <Link href="/onboarding?new=1" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-fg-muted hover:bg-white/5 hover:text-fg">
            <Plus className="size-4" aria-hidden /> Add another business
          </Link>
        </div>
      )}
    </div>
  );
}
