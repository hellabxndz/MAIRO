"use client";

import { useState, useTransition } from "react";
import { regenerateConceptAction } from "@/lib/actions/creative-actions";

// Retry for a request whose concept failed to generate — usually because the
// AI key was missing at the time, or the provider was briefly unavailable.
// Retrying does not consume another creative request from the monthly plan.
export function RegenerateConceptButton({ creativeRequestId }: { creativeRequestId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await regenerateConceptAction(creativeRequestId);
            if (result?.error) setError(result.error);
          })
        }
        className="rounded-lg border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.1em] text-neutral-300 transition hover:border-white hover:bg-white hover:text-black disabled:opacity-60"
      >
        {pending ? "Writing…" : "Write the concept"}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
