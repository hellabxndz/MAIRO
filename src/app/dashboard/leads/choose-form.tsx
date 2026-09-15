"use client";

import { useTransition } from "react";
import { startOwnLeadFormAction, writeLeadFormAction } from "@/lib/actions/lead-actions";
import { primaryButtonClass } from "@/components/ui";

// Two ways to get a form, offered as a choice rather than one being the only
// way. MAIRO's is the recommendation and is listed first, because the questions
// are written per trade and kept deliberately short — but a business that knows
// something about its customers MAIRO does not should not have to accept a form
// that misses it.
export function ChooseForm({ preview }: { preview: string[] }) {
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col rounded-xl border border-white/15 bg-white/[0.03] p-5">
        <p className="text-sm font-medium text-white">Let MAIRO write it</p>
        <p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
          Questions chosen for your trade, kept short so people finish them.
        </p>
        {preview.length > 0 && (
          <ol className="mt-4 flex-1 space-y-1">
            {preview.map((q, i) => (
              <li key={q} className="text-sm text-neutral-500">
                {i + 1}. {q}
              </li>
            ))}
          </ol>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await writeLeadFormAction()))}
          className={`${primaryButtonClass} mt-5`}
        >
          {pending ? "Writing…" : "Use these"}
        </button>
      </div>

      <div className="flex flex-col rounded-xl border border-white/10 p-5">
        <p className="text-sm font-medium text-white">I&apos;ll write my own</p>
        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-neutral-400">
          Pick your own questions and answer types. Starts with a name and a phone number —
          every form needs a way to reply — and you change the rest.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await startOwnLeadFormAction()))}
          className="mt-5 rounded-lg border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.1em] text-neutral-300 transition hover:border-white hover:bg-white hover:text-black disabled:opacity-50"
        >
          {pending ? "Starting…" : "Build it myself"}
        </button>
      </div>
    </div>
  );
}
