"use client";

import { useState, useTransition } from "react";
import { setCaseStudyConsentAction } from "@/lib/actions/feedback-actions";

// Permission to share this business's results in an anonymized case study.
// Off unless the business turns it on; turning it off takes effect at once.

export function CaseStudyConsent({ given }: { given: boolean }) {
  const [on, setOn] = useState(given);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <span className="min-w-0">
        <span className="block text-[14px] text-white">Share my results anonymously</span>
        <span className="block text-[12px] leading-relaxed text-faint">
          MAIRO may use your campaign results — never your name, brand, customers or anything that identifies you — in a
          case study about what MAIRO does for businesses like yours. Off unless you turn it on; turn it off any time.
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Share my results anonymously"
        disabled={pending}
        onClick={() => {
          const next = !on;
          start(async () => {
            const r = await setCaseStudyConsentAction(next);
            if (r.ok) setOn(next);
          });
        }}
        className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${on ? "bg-[image:var(--mairo-ramp)]" : "bg-white/15"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-paper shadow-sm transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
