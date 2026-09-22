"use client";

import { PRESETS } from "@/lib/creative-studio/presets";
import type { CreativeStylePreset } from "@/generated/prisma/enums";

// The style cards. A preset is art direction folded into the prompt (see
// presets.ts), not a filter — so the description under each card says what
// kind of image it produces, not a swatch of colour.

export function PresetGrid({
  value,
  onChange,
}: {
  value: CreativeStylePreset | null;
  onChange: (preset: CreativeStylePreset | null) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {PRESETS.map((p) => {
        const on = value === p.key || (value === null && p.key === "CUSTOM");
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key === "CUSTOM" ? null : p.key)}
            aria-pressed={on}
            className={`rounded-xl border px-3.5 py-3 text-left transition-all duration-300 [transition-timing-function:var(--ease-mairo)] ${
              on ? "border-sky-400/50 bg-sky-400/[0.08]" : "border-white/[0.08] hover:border-white/20"
            }`}
          >
            <span className="block text-[12.5px] font-medium text-white">{p.label}</span>
            <span className="mt-1 block text-[11px] leading-snug text-neutral-400">{p.description}</span>
          </button>
        );
      })}
    </div>
  );
}
