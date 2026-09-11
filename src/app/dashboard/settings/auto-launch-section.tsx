"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { setAutoLaunchHeldAction } from "@/lib/actions/settings-actions";

// Whether MAIRO may switch a finished campaign on by itself.
//
// The default is that it may, and that is the right default: the alternative
// is an account that has paid, connected, funded and approved an ad, and then
// sits at zero because nobody knew there was one more button. Most people
// buying this are buying it precisely so they do not have to know that.
//
// But it spends real money without anyone pressing anything, so it is stated
// in full on this screen rather than buried in terms, and there is a switch.
// Off is a pause on future launches — it never stops a campaign that is
// already running, and saying so here avoids someone flipping it in a panic
// expecting their spend to stop.

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
          <h2 className="text-base text-white">Go live without asking me</h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-neutral-400">
            With this on, MAIRO switches a campaign on as soon as everything it needs is
            done — your plan is paid, your Meta account is connected and can be charged,
            and you&rsquo;ve approved an ad. You don&rsquo;t have to come back and press
            anything.
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
            <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
          </span>
        </label>
      </div>

      <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <p className="text-xs font-medium text-neutral-300">What it will and won&rsquo;t do</p>
        <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-neutral-500">
          <li>
            It only starts campaigns MAIRO already built for you, at the daily budget you
            set. It never{" "}
            <span className="text-neutral-300">creates</span> a campaign you haven&rsquo;t
            asked for and never raises a budget.
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
          {on
            ? `MAIRO will start ${waitingCount === 1 ? "it" : "them"} the moment your setup is finished.`
            : `MAIRO is holding ${waitingCount === 1 ? "it" : "them"} because this is switched off.`}
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
