"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { HANDOFF_KEY, describeHandoff, dropHandoff, readHandoffs, type Handoff } from "@/lib/tools/handoff";

// Results from MAIRO's free tools, offered during setup. Nothing is filled in
// until the owner presses "Use" — and then it lands in a visible field they
// can still change. "Not now" forgets it.

export function ToolHandoff({ kinds, onUse }: { kinds: Handoff["kind"][]; onUse: (h: Handoff) => string }) {
  // Read through useSyncExternalStore: nothing on the server, the saved results in the browser.
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      return () => window.removeEventListener("storage", cb);
    },
    () => {
      try {
        return window.localStorage.getItem(HANDOFF_KEY);
      } catch {
        return null;
      }
    },
    () => null,
  );
  const [handled, setHandled] = useState<string[]>([]);
  const [used, setUsed] = useState<string[]>([]);
  const items = useMemo(
    () => (raw ? readHandoffs() : []).filter((h) => kinds.includes(h.kind) && !handled.includes(`${h.kind}-${h.tool}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, handled],
  );
  if (!items.length && !used.length) return null;
  return (
    <section aria-label="From the free tools" className="mt-5 rounded-xl border border-violet/35 bg-violet/[0.06] p-4">
      <p className="text-[13.5px] font-medium text-white">From MAIRO&rsquo;s free tools</p>
      <p className="mt-0.5 text-[12.5px] text-muted">Saved on this device when you used a tool. Use what&rsquo;s right — you can change it after.</p>
      <ul className="mt-3 space-y-2.5">
        {items.map((h) => {
          const d = describeHandoff(h);
          return (
            <li key={`${h.kind}-${h.tool}`} className="flex flex-col gap-2 rounded-lg bg-white/[0.04] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[13.5px] text-white">{d.title}</p>
                <p className="line-clamp-2 text-[12px] text-white/55">{d.detail}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="min-h-[36px] rounded-full bg-violet px-3.5 text-[12.5px] font-medium text-white hover:brightness-110"
                  onClick={() => {
                    const where = onUse(h);
                    dropHandoff(h);
                    setHandled((x) => [...x, `${h.kind}-${h.tool}`]);
                    setUsed((u) => [...u, `${d.title} — ${where}`]);
                  }}
                >
                  Use
                </button>
                <button
                  type="button"
                  className="min-h-[36px] rounded-full border border-white/15 px-3.5 text-[12.5px] text-white/75 hover:border-white/35"
                  onClick={() => {
                    dropHandoff(h);
                    setHandled((x) => [...x, `${h.kind}-${h.tool}`]);
                  }}
                >
                  Not now
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {used.length > 0 && (
        <ul className="mt-2 space-y-1" aria-live="polite">
          {used.map((u) => <li key={u} className="text-[12.5px] text-emerald-300">✓ {u}</li>)}
        </ul>
      )}
      <p className="mt-2 text-[11.5px] text-white/45">
        <Link href="/tools" className="underline underline-offset-2 hover:text-white" target="_blank">Free tools</Link> run in your browser; nothing reached MAIRO until now.
      </p>
    </section>
  );
}
