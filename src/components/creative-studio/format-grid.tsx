"use client";

import { FORMAT_LABEL } from "@/lib/creative-studio/format-info";
import type { CreativeFormat } from "@/generated/prisma/enums";

const FORMATS: CreativeFormat[] = ["SQUARE", "PORTRAIT", "STORY", "LANDSCAPE"];

/**
 * The four advertising shapes, with what each is actually for — a business
 * owner does not arrive knowing that Stories are 9:16, so the placement name
 * has to carry the ratio, not the other way around.
 */
export function FormatGrid({
  value,
  onChange,
}: {
  value: CreativeFormat;
  onChange: (format: CreativeFormat) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {FORMATS.map((f) => {
        const info = FORMAT_LABEL[f];
        const on = value === f;
        return (
          <button
            key={f}
            type="button"
            onClick={() => onChange(f)}
            aria-pressed={on}
            className={`rounded-xl border px-3.5 py-3 text-left transition-all duration-300 [transition-timing-function:var(--ease-mairo)] ${
              on ? "border-sky-400/50 bg-sky-400/[0.08]" : "border-white/[0.08] hover:border-white/20"
            }`}
          >
            <span className="flex items-baseline gap-1.5">
              <span className="text-[12.5px] font-medium text-white">{info.name}</span>
              <span className="font-mono text-[10px] text-neutral-500">{info.ratio}</span>
            </span>
            <span className="mt-1 block text-[10.5px] leading-snug text-neutral-500">{info.use}</span>
          </button>
        );
      })}
    </div>
  );
}
