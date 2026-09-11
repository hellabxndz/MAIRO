"use client";

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
}: {
  campaignId: string;
  name: string;
  running: boolean;
  freesSlot: boolean;
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
        className="mt-3 text-xs text-neutral-500 underline decoration-white/15 underline-offset-4 transition hover:text-red-300 hover:decoration-red-300/40"
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

      {/* A failure here means the campaign is still live. Said at full length
          rather than as a red one-liner, because the customer needs to know
          their ads did not stop. */}
      {error && <p className="mt-3 max-w-2xl text-xs leading-relaxed text-red-300">{error}</p>}
    </div>
  );
}
