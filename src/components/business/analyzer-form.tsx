"use client";

import { useActionState } from "react";
import { analyzeBusinessAction } from "@/lib/actions/business-actions";

/** "Enter your website" → "Analyze My Business". */
export function BusinessAnalyzer({ defaultUrl, analyzed }: { defaultUrl: string; analyzed: boolean }) {
  const [state, action, pending] = useActionState(analyzeBusinessAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <label className="min-w-0 sm:min-w-[260px] sm:flex-1">
        <span className="text-[12.5px] text-muted">Enter your website</span>
        <input
          name="url"
          type="text"
          inputMode="url"
          defaultValue={defaultUrl}
          placeholder="https://example.com"
          className="mt-1.5 w-full rounded-xl border bg-transparent px-4 py-3 text-[14px] text-white placeholder:text-faint focus:outline-none"
          style={{ borderColor: "var(--mairo-line)" }}
          required
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full px-6 py-3 text-[13.5px] font-medium text-white disabled:opacity-60"
        style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
      >
        {pending ? "Reading your site…" : analyzed ? "Analyze again" : "Analyze My Business"}
      </button>
      {state?.error && <p className="text-[12.5px] text-amber-200/90 sm:basis-full">{state.error}</p>}
      {pending && (
        <p className="text-[12.5px] text-muted sm:basis-full">
          MAIRO is reading your pages and working out what you sell and who to reach. This takes up to a minute.
        </p>
      )}
    </form>
  );
}
