"use client";

import { useState, useTransition } from "react";
import { rerunSafetyReviewAction } from "@/lib/actions/aios-actions";

// The only button that belongs on a request the checker couldn't reach.
//
// Not "approve" and not "reject" — those are the reviewer's words, and a human
// pressing them is the thing this product is supposed to remove. This asks the
// reviewer again and writes down whatever it says.
export function RerunReviewButton({
  requestId,
  organizationId,
  label = "Run the check again",
}: {
  requestId: string;
  organizationId: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-1 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            const result = await rerunSafetyReviewAction(requestId, organizationId);
            setMessage(result.message);
          })
        }
        className="whitespace-nowrap rounded-lg border border-[color:var(--mairo-line)] px-3 py-1.5 text-xs text-white/85 transition hover:border-[color:var(--mairo-line-lit)] hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
      >
        {pending ? "Checking…" : label}
      </button>
      {message && <p className="max-w-56 text-xs text-neutral-500">{message}</p>}
    </div>
  );
}
