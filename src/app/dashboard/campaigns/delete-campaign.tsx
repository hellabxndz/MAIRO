"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteCampaignAction } from "@/lib/actions/campaign-actions";

// Deleting a campaign, with the one sentence that matters said before it
// happens rather than after.
//
// Two clicks, not one, and no browser confirm() — that dialog is unstyled,
// unreadable on a phone, and says nothing useful. The second step is where the
// consequence lives: a running campaign is spending money right now, and
// "delete" needs to make clear that the ads stop, because plenty of people
// will read it as "remove it from this list".
//
// The other thing it has to be honest about is that this is how a Starter
// customer makes room. Nothing is lost that can be got back by upgrading, so
// the wording doesn't pretend deleting is reversible.

export function DeleteCampaign({
  campaignId,
  name,
  running,
  /** True when this is the only thing standing between them and a new one. */
  freesSlot,
  /** The next plan up, offered instead of deleting when the limit is the reason. */
  upgrade,
}: {
  campaignId: string;
  name: string;
  running: boolean;
  freesSlot: boolean;
  upgrade?: { name: string; price: number; campaigns: number } | null;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    setError(null);
    start(async () => {
      const result = await deleteCampaignAction(campaignId);
      if (result.error) {
        setError(result.error);
        return;
      }
      // On success the page revalidates and this card goes with it, so there
      // is nothing to reset.
      setAsking(false);
    });
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mt-4 inline-flex items-center rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:border-red-400 hover:bg-red-500 hover:text-white"
      >
        Delete campaign
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-4">
      <p className="text-sm text-white">Delete {name}?</p>
      <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-neutral-400">
        {running
          ? "The ads stop running on Meta straight away and you won't be charged for them after that. This can't be undone — MAIRO would have to build a new campaign from scratch, and it would go back through Meta's review."
          : "This can't be undone. MAIRO would have to build a new campaign from scratch, and it would go back through Meta's review."}
        {freesSlot && " Deleting it frees up your plan's campaign slot, so you can create another."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className="rounded-full bg-red-500/90 px-4 py-2 text-[11px] font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
        >
          {pending ? "Stopping the ads…" : running ? "Stop and delete" : "Delete"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
          className="text-[11px] text-neutral-400 underline underline-offset-4 transition hover:text-white"
        >
          Keep it
        </button>
      </div>

      {/* Offered here because this is the moment it is actually relevant: they
          are deleting a campaign that works, purely to get the slot back. The
          plan that removes the choice belongs in front of them at the point
          they are about to pay for it with a working campaign — not buried on
          a billing page they had no reason to open. */}
      {freesSlot && upgrade && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="text-xs text-neutral-400">Or don&apos;t choose between them:</p>
          <Link
            href="/dashboard/settings#billing"
            className="mt-2 inline-flex items-center rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-black shadow-[0_0_28px_-8px_rgba(52,211,153,0.7)] transition hover:bg-emerald-300"
          >
            Keep this one and run {upgrade.campaigns} — {upgrade.name}, ${upgrade.price}/mo
          </Link>
        </div>
      )}

      {/* A failure here means the campaign is still live. Said at full length
          rather than as a red one-liner, because the customer needs to know
          their ads did not stop. */}
      {error && <p className="mt-3 max-w-2xl text-xs leading-relaxed text-red-300">{error}</p>}
    </div>
  );
}
