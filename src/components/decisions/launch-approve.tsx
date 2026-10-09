"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveCampaignAction } from "@/lib/actions/campaign-actions";

// Approving a launch from the Approval Center: the budget is shown and
// confirmed in place before anything is sent, and "live" is said only when
// Meta has switched the campaign on — otherwise the reason it isn't yet.

export function LaunchApprove({ campaignId, name, budget }: { campaignId: string; name: string; budget: string }) {
  const [step, setStep] = useState<"idle" | "confirm" | "done">("idle");
  const [message, setMessage] = useState<{ live: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const approve = () =>
    start(async () => {
      const res = await approveCampaignAction(campaignId);
      setStep("done");
      setMessage(res?.error ? { live: false, text: res.error } : { live: true, text: `Meta confirmed “${name}” is live.` });
      router.refresh();
    });

  if (step === "done" && message) {
    return <p className={`text-[12.5px] ${message.live ? "text-live" : "text-warn"}`} role="status">{message.text}</p>;
  }
  if (step === "confirm") {
    return (
      <div className="rounded-xl border border-warn/40 bg-warn/[0.06] p-3">
        <p className="text-[12.5px] text-white">
          Launch “{name}” at <span className="font-medium">{budget}</span>, charged by Meta to your ad account? You can pause it any time.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={approve} className="rounded-full bg-[image:var(--mairo-ramp)] px-4 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-60">
            {pending ? "Asking Meta…" : "Yes, approve the launch"}
          </button>
          <button type="button" disabled={pending} onClick={() => setStep("idle")} className="rounded-full border border-[color:var(--mairo-line)] px-4 py-1.5 text-[12.5px] text-white/85">
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setStep("confirm")} className="rounded-full bg-[image:var(--mairo-ramp)] px-4 py-2 text-[12.5px] font-medium text-white">
      Review and approve launch
    </button>
  );
}
