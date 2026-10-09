"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { setAutoLaunchHeldAction } from "@/lib/actions/settings-actions";

// When the owner's spending agreement counts as their approval to launch.
//
// Nothing goes live without a person's recorded approval (launchApprovedAt —
// see campaigns/auto-launch.ts). What this switch decides is which press
// counts. On: ticking "I agree to spend …" with the budget shown, while
// building a campaign, is that approval, and MAIRO switches the campaign on
// once Meta has approved the ad and confirmed the account can be charged —
// the owner doesn't have to come back. Held: building only builds, and the
// campaign waits in the Approval Center for an Approve press.
//
// Either way MAIRO never starts a campaign nobody approved and never raises
// a budget. Holding only affects future launches — it never stops a campaign
// that is already running, and saying so here avoids someone flipping it in a
// panic expecting their spend to stop.

export function AutoLaunchSection({
  held,
  waitingCount,
  lastLaunchedAt,
}: {
  held: boolean;
  /** Campaigns built and waiting on the remaining setup steps. */
  waitingCount: number;
  lastLaunchedAt: Date | null;
}) {
  const [on, setOn] = useState(!held);
  const [pending, start] = useTransition();

  function toggle(next: boolean) {
    setOn(next);
    start(async () => {
      await setAutoLaunchHeldAction(!next);
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base text-white">Launch as soon as Meta is ready, once I&rsquo;ve agreed the budget</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-neutral-400">
            Every campaign needs your approval before it can spend. With this on, ticking
            &ldquo;I agree to spend&nbsp;…&rdquo; with the budget shown when you build a campaign is that
            approval: MAIRO switches it on once Meta approves the ad and confirms your ad
            account can be charged, so you don&rsquo;t have to come back. Held: MAIRO builds
            campaigns switched off and waits for you to press Approve in your Approval Center.
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-3">
          <span className="text-xs uppercase tracking-[0.16em] text-neutral-400">
            {on ? "On" : "Held"}
          </span>
          <span className="relative inline-block h-6 w-11">
            <input
              type="checkbox"
              checked={on}
              disabled={pending}
              onChange={(e) => toggle(e.target.checked)}
              className="peer sr-only"
            />
            <span className="block h-6 w-11 rounded-full bg-white/10 transition peer-checked:bg-sky-400/70" />
            <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-paper shadow-sm transition peer-checked:translate-x-5" />
          </span>
        </label>
      </div>

      <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="text-xs font-medium text-neutral-300">What it will and won&rsquo;t do</p>
        <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-neutral-500">
          <li>
            It only starts campaigns you approved, at the budget you agreed to. It never{" "}
            <span className="text-neutral-300">launches</span> a campaign you haven&rsquo;t
            approved and never raises a budget — at any automation level.
          </li>
          <li>
            It asks Meta whether your ad account can actually be charged. If Meta
            won&rsquo;t answer, nothing goes live — a live campaign and a declined card is
            not a surprise worth risking.
          </li>
          <li>
            It stays inside your plan&rsquo;s campaign limit. Anything over it waits.
          </li>
          <li>
            Turning this off pauses future launches only. Campaigns already running keep
            running — pause those on the campaign itself.
          </li>
        </ul>
      </div>

      {waitingCount > 0 && (
        <p className="mt-4 text-xs text-neutral-400">
          {waitingCount} campaign{waitingCount === 1 ? "" : "s"} built and waiting.{" "}
          Any you&rsquo;ve approved start once Meta is ready; anything not yet approved waits in
          your Approval Center.
        </p>
      )}

      {lastLaunchedAt && (
        <p className="mt-2 text-xs text-neutral-600">
          MAIRO last put something live on {lastLaunchedAt.toLocaleDateString()}.
        </p>
      )}
    </Card>
  );
}
