"use client";

import { useState, useTransition } from "react";
import { sendFeedbackAction } from "@/lib/actions/feedback-actions";

// "Thinking about cancelling?" — asked before the business goes to Stripe,
// never as a gate: cancelling is still one click in Manage billing, whether
// or not they answer. The answer goes to the MAIRO team, nowhere else.

const REASONS = [
  "It costs too much",
  "I'm not seeing results",
  "It's too complicated",
  "I don't need ads right now",
  "It's missing something I need",
  "Something else",
];

export function CancelReason() {
  const [reason, setReason] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (sent) {
    return (
      <p className="mt-6 rounded-2xl bg-white/[0.035] px-4 py-3 text-[13px] text-white/80">
        Thank you for telling us. You can cancel in <span className="text-white">Manage billing</span> above — nothing
        changes until you do, and your campaigns, plan and connections are kept if you come back.
      </p>
    );
  }

  return (
    <details className="mt-6 rounded-2xl bg-white/[0.025] px-4 py-3">
      <summary className="cursor-pointer text-[13px] text-muted hover:text-white">Thinking about cancelling?</summary>
      <p className="mt-3 text-[13px] text-white/75">
        Before you go, would you tell us why? It&rsquo;s optional — you can cancel in Manage billing either way.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            onClick={() => setReason(r)}
            className={`min-h-[36px] rounded-full border px-3.5 text-[12.5px] transition ${
              reason === r ? "border-transparent bg-[image:var(--mairo-ramp)] text-white" : "border-[color:var(--mairo-line)] text-white/80 hover:text-white"
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={2000}
        aria-label="Anything else?"
        placeholder="Anything else? (optional)"
        className="mt-3 w-full rounded-xl border border-[color:var(--mairo-line)] bg-white/[0.03] px-3 py-2 text-[13px] text-white outline-none placeholder:text-faint"
      />
      {error && <p className="mt-2 text-[12.5px] text-red-300">{error}</p>}
      <button
        type="button"
        disabled={pending || (!reason && !text.trim())}
        onClick={() =>
          start(async () => {
            const r = await sendFeedbackAction({ kind: "CANCELLATION", text: [reason, text.trim()].filter(Boolean).join(" — "), page: "/dashboard/billing" });
            if (!r.ok) return setError(r.error ?? "Couldn't send that.");
            setSent(true);
          })
        }
        className="mt-3 rounded-full border border-[color:var(--mairo-line)] px-4 py-2 text-[13px] text-white/85 hover:text-white disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send"}
      </button>
    </details>
  );
}
