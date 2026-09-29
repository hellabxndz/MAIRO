"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { answerSocialQuestionAction } from "@/lib/actions/social-actions";
import type { Network } from "@/lib/instagram/social-logic";

// Scale's question on the dashboard: may MAIRO post on their Instagram feed,
// then (once that's answered) on their Facebook Page? Yes leads to that
// network's page, where every post is previewed and approved before anything
// goes out.

export function SocialQuestion({ network }: { network: Network }) {
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;
  const facebook = network === "FACEBOOK";
  return (
    <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-violet/30 bg-violet/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[15px] font-semibold text-white">{facebook ? "Let MAIRO post on your Facebook Page?" : "Let MAIRO post on your Instagram feed?"}</p>
        <p className="mt-1 text-[13px] text-muted">MAIRO shows you exactly how each post will look first. Nothing is posted until you approve it.</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link href={facebook ? "/dashboard/social/facebook" : "/dashboard/social/instagram"} className="inline-flex min-h-[42px] items-center rounded-lg bg-[#7c5cff] px-4 text-[13.5px] font-medium text-white hover:brightness-110">
          Yes — show me
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { await answerSocialQuestionAction(network, false).catch(() => null); setGone(true); })}
          className="min-h-[42px] rounded-lg border border-white/12 px-4 text-[13.5px] text-white/85 hover:border-white/30 disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
