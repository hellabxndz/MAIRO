"use client";

import { useActionState } from "react";
import { refineConceptAction } from "@/lib/actions/creative-actions";
import { inputClass } from "@/components/ui";

/**
 * Reply box under a concept.
 *
 * Refining is free and unlimited on purpose: this is where the client tells us
 * what we got wrong, and charging a creative request for a misunderstanding
 * would be charging them for our mistake.
 */
export function ConceptReply({ creativeRequestId }: { creativeRequestId: string }) {
  const [state, formAction, pending] = useActionState(
    refineConceptAction.bind(null, creativeRequestId),
    undefined
  );

  return (
    <form action={formAction} className="mt-5 space-y-2 border-t border-white/10 pt-4">
      <label className="block text-xs uppercase tracking-[0.12em] text-neutral-600">
        Not quite right? Tell the AI
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="message"
          className={inputClass}
          placeholder="e.g. my shop is DRYROT, and leads means DMs for custom orders"
          disabled={pending}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg border border-white/25 px-4 py-2 text-xs uppercase tracking-[0.1em] text-white transition hover:border-white hover:bg-white hover:text-black disabled:opacity-60"
        >
          {pending ? "Rewriting…" : "Rewrite it"}
        </button>
      </div>
      <p className="text-xs text-neutral-600">
        Free and unlimited — reworking a concept never uses up one of your monthly
        creative requests.
      </p>
      {state?.error && <p className="text-sm text-red-400">{state.error}</p>}
    </form>
  );
}
