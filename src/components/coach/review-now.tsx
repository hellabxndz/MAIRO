"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runCoachNowAction } from "@/lib/actions/coach-actions";

/** Ask the AI team to review now, rather than waiting for the daily review. */
export function ReviewNow() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runCoachNowAction();
            setMessage(r.message);
            router.refresh();
          })
        }
        className="rounded-full border border-[color:var(--mairo-line)] px-4 py-2 text-[13px] text-white hover:border-[color:var(--mairo-line-lit)] disabled:opacity-60"
      >
        {pending ? "Reviewing your results…" : "Review now"}
      </button>
      {message && (
        <p className="max-w-[520px] text-[12.5px] text-muted" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
