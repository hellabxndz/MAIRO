"use client";

import { useActionState } from "react";
import { requestCreativeAction } from "@/lib/actions/creative-actions";
import { inputClass, primaryButtonClass } from "@/components/ui";

const TYPES = [
  { value: "IMAGE", label: "Image" },
  { value: "VIDEO", label: "Video" },
  { value: "COPY", label: "Ad copy" },
  { value: "CAROUSEL", label: "Carousel" },
];

export function CreativeRequestForm() {
  const [state, formAction, pending] = useActionState(requestCreativeAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">Type</label>
          <select name="type" required className={inputClass}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-400">Brief</label>
          <input
            name="brief"
            required
            className={inputClass}
            placeholder="e.g. Promo image for our fall sale, 20% off, warm colors"
          />
        </div>
      </div>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Sending..." : "Request creative"}
      </button>
    </form>
  );
}
