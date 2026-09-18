"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { approveCampaignAction } from "@/lib/actions/campaign-actions";

// The approval step.
//
// Everything else MAIRO does, it does on its own. This is the one thing it will
// not: the moment money starts being spent is the moment a person has to say
// so, and no amount of confidence in the campaign changes that.
//
// Two states, and the difference matters. When something is still outstanding
// the button is not there at all — a disabled button that explains itself in a
// tooltip is a button that looks like the product is being difficult. When
// everything passes, the button is the only emphasised thing on the screen.
//
// "Request changes" and "Ask MAIRO" both open the assistant rather than a form.
// A change request typed into a textarea goes nowhere until somebody reads it;
// the same sentence said to MAIRO is acted on while the person is still here.

export function CampaignApproval({
  campaignId,
  blockers,
}: {
  campaignId: string;
  blockers: string[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (blockers.length > 0) {
    return (
      <section
        id="approve"
        className="rounded-[var(--radius-panel)] border p-5 sm:p-6"
        style={{ borderColor: "var(--mairo-line)", background: "rgba(10,16,32,0.5)" }}
      >
        <h2 className="text-[15px] font-medium text-white">Not ready to launch yet</h2>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
          MAIRO will not put a campaign live while something is missing — it would spend the
          budget badly rather than not at all. Still to sort:
        </p>
        <ul className="mt-4 space-y-2">
          {blockers.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-[13px] text-white/85">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              <span className="first-letter:uppercase">{b}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section
      id="approve"
      className="rounded-[var(--radius-panel)] border p-5 sm:p-6"
      style={{
        borderColor: "rgba(108,158,255,0.4)",
        background: "linear-gradient(158deg, rgba(28,48,104,0.5), rgba(9,15,36,0.7))",
        boxShadow: "0 0 30px rgba(61,125,255,0.18)",
      }}
    >
      <h2 className="text-[16px] font-medium text-white">Ready for your approval</h2>
      <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-muted">
        MAIRO has built this campaign in your own advertising account and left it paused. Approving
        it is what starts the spending — and you can pause it again at any time.
      </p>

      {error && <p className="mt-4 text-[13px] text-alert">{error}</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await approveCampaignAction(campaignId);
              if (result?.error) setError(result.error);
            })
          }
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium text-white transition-all duration-300 [transition-timing-function:var(--ease-mairo)] hover:brightness-110 disabled:pointer-events-none disabled:opacity-50"
          style={{ backgroundImage: "var(--mairo-ramp)", boxShadow: "var(--mairo-glow-key)" }}
        >
          {pending ? "Launching…" : "Approve and launch"}
          <span aria-hidden>→</span>
        </button>

        <Link
          href={`/dashboard/agents?about=${campaignId}&ask=changes`}
          className="rounded-full border px-5 py-2.5 text-[13px] text-white/85 transition-colors hover:border-[color:var(--mairo-line-lit)] hover:text-white"
          style={{ borderColor: "var(--mairo-line)" }}
        >
          Request changes
        </Link>

        <Link
          href={`/dashboard/agents?about=${campaignId}`}
          className="text-[13px] text-muted transition-colors hover:text-white"
        >
          Ask MAIRO about it
        </Link>
      </div>
    </section>
  );
}
