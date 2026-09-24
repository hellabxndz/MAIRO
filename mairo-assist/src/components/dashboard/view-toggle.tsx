"use client";

import { useOptimistic, useTransition } from "react";
import { setDashboardView } from "@/lib/dashboard/actions";
import { cn } from "@/lib/utils";

export function ViewToggle({ view }: { view: "simple" | "advanced" }) {
  const [optimistic, setOptimistic] = useOptimistic(view);
  const [, start] = useTransition();
  return (
    <div role="radiogroup" aria-label="Dashboard view" className="inline-flex rounded-xl border border-line p-0.5 text-xs">
      {(["simple", "advanced"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={optimistic === v}
          onClick={() =>
            start(async () => {
              setOptimistic(v);
              await setDashboardView(v);
            })
          }
          className={cn(
            "rounded-lg px-3 py-1.5 capitalize transition-colors",
            optimistic === v ? "bg-white/10 text-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
