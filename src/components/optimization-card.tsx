"use client";

import { useActionState } from "react";
import {
  applyRecommendationAction,
  dismissRecommendationAction,
  type CampaignRecommendation,
} from "@/lib/actions/optimize-actions";
import { Card } from "@/components/ui";
import { PlatformIcon } from "@/components/platform-icons";
import type { AdPlatform } from "@/generated/prisma/enums";

// "TikTok is doing better than Meta. Want to move some money?"
//
// The design constraint is that this must never feel like something happening
// to the customer. It shows the current split, the proposed split, and the
// reason, and nothing changes until they press the button. That is why the
// before-and-after are both on screen rather than just the recommendation —
// a proposal you can't compare against what you have is an instruction.

function label(platform: AdPlatform): string {
  return platform === "META" ? "Meta" : platform === "TIKTOK" ? "TikTok" : platform;
}

export function OptimizationCard({ item }: { item: CampaignRecommendation }) {
  const [applyState, apply, applying] = useActionState(applyRecommendationAction, undefined);
  const [, dismiss, dismissing] = useActionState(dismissRecommendationAction, undefined);

  const changed = item.recommendation.proposal.filter((p) => p.fromPercent !== p.toPercent);
  if (applyState?.applied) {
    return (
      <Card>
        <p className="text-sm text-emerald-300">
          Budget updated for {item.campaignName}.
          {applyState.error && (
            <span className="mt-1 block text-xs text-amber-200/80">{applyState.error}</span>
          )}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-[9px] uppercase tracking-[0.16em] text-sky-300">
            {item.recommendation.headline}
          </span>
          <p className="mt-3 text-sm text-white">{item.recommendation.rationale}</p>
          <p className="mt-1 text-xs text-neutral-500">{item.campaignName}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">Current</p>
          <ul className="mt-2.5 space-y-1.5">
            {item.recommendation.proposal.map((p) => (
              <li key={p.platform} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-neutral-300">
                  <PlatformIcon platform={p.platform} className="h-3.5 w-3.5" />
                  {label(p.platform)}
                </span>
                <span className="tabular-nums text-neutral-400">{p.fromPercent}%</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-sky-400/25 bg-sky-400/[0.06] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-sky-300/80">Recommended</p>
          <ul className="mt-2.5 space-y-1.5">
            {item.recommendation.proposal.map((p) => {
              const up = p.toPercent > p.fromPercent;
              const moved = p.toPercent !== p.fromPercent;
              return (
                <li key={p.platform} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-neutral-200">
                    <PlatformIcon platform={p.platform} className="h-3.5 w-3.5" />
                    {label(p.platform)}
                  </span>
                  <span
                    className={`tabular-nums ${
                      moved ? (up ? "text-emerald-300" : "text-neutral-400") : "text-neutral-400"
                    }`}
                  >
                    {p.toPercent}%
                    {moved && (
                      <span className="ml-1.5 text-[10px]">
                        {up ? "↑" : "↓"}
                        {Math.abs(p.toPercent - p.fromPercent)}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {changed.length > 0 && (
        <p className="mt-4 text-xs text-neutral-500">
          Your total daily budget doesn&rsquo;t change — this only moves it between
          platforms. Nothing happens until you apply it.
        </p>
      )}

      {applyState?.error && !applyState.applied && (
        <p className="mt-3 text-sm text-red-400">{applyState.error}</p>
      )}

      <div className="mt-5 flex flex-wrap gap-3">
        <form action={apply}>
          <input type="hidden" name="recommendationId" value={item.recommendationId} />
          <button
            type="submit"
            disabled={applying}
            className="rounded-full bg-white px-5 py-2.5 text-xs font-medium text-black transition hover:bg-neutral-200 disabled:opacity-60"
          >
            {applying ? "Applying…" : "Apply Mairo Recommendation"}
          </button>
        </form>
        <form action={dismiss}>
          <input type="hidden" name="recommendationId" value={item.recommendationId} />
          <button
            type="submit"
            disabled={dismissing}
            className="rounded-full border border-white/10 px-5 py-2.5 text-xs text-neutral-400 transition hover:border-white/25 hover:text-white disabled:opacity-60"
          >
            Not now
          </button>
        </form>
      </div>
    </Card>
  );
}
