"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { launchPlanCampaignAction } from "@/lib/actions/strategy-actions";

// "Launch Campaign": the only thing that lets the first campaign spend. The
// budget is stated and has to be agreed to first; nothing goes live on its own.

export function LaunchPanel({ dailyBudget, campaignHref }: { dailyBudget: string; campaignHref: string }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function launch() {
    if (!agreed) return;
    start(async () => {
      const r = await launchPlanCampaignAction().catch(() => ({ ok: false as const, error: "Mairo couldn't reach the server. Nothing was launched — try again." }));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setError(null);
      setMessage(r.message);
      router.refresh();
    });
  }

  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-4">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#7c5cff]" />
        <span className="text-[13.5px] leading-relaxed text-white/90">
          I agree to spend up to {dailyBudget} a day on this campaign, charged by Meta to my ad account. I can pause it any time.
        </span>
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={launch} disabled={!agreed || pending} className="min-h-[48px] rounded-lg bg-[#7c5cff] px-7 text-[15px] font-medium text-white hover:brightness-110 disabled:opacity-50">
          {pending ? "Launching…" : "Launch Campaign"}
        </button>
        <Link href={campaignHref} className="inline-flex min-h-[48px] items-center rounded-lg border border-white/12 px-5 text-[14px] text-white/85 hover:border-white/30">
          Make Changes
        </Link>
        <Link href="/dashboard/agents" className="inline-flex min-h-[48px] items-center rounded-lg border border-white/12 px-5 text-[14px] text-white/85 hover:border-white/30">
          Ask Mairo
        </Link>
      </div>
      {message && <p className="mt-4 rounded-lg bg-white/[0.04] px-4 py-3 text-[13.5px] text-white/90">{message}</p>}
      {error && <p className="mt-4 rounded-lg bg-alert/10 px-4 py-3 text-[13.5px] text-alert">{error}</p>}
    </div>
  );
}
