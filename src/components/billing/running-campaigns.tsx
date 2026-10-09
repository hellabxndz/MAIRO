"use client";

import { useState, useTransition } from "react";
import { pauseCampaignAction } from "@/lib/actions/protection-actions";

// The MAIRO campaigns still running in Meta, with a way to pause each — shown
// before anyone cancels or deletes, because neither stops Meta spending.
//
// A row says "Paused" only after the pause came back confirmed by Meta (the
// action marks a campaign paused only then). A refusal is shown as it came,
// with Ads Manager as the way out.

type Row = { id: string; name: string; dailyBudgetCents: number; /** False for a client business other than the one open now. */ pausable?: boolean };
type State = { kind: "idle" } | { kind: "paused" } | { kind: "failed"; error: string };

const usd = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const ADS_MANAGER = "https://adsmanager.facebook.com/adsmanager/manage/campaigns";

export function RunningCampaigns({ campaigns, canPause }: { campaigns: Row[]; canPause: boolean }) {
  const [states, setStates] = useState<Record<string, State>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  async function pauseOne(id: string) {
    setBusy(id);
    const result = await pauseCampaignAction(id);
    setStates((s) => ({ ...s, [id]: result?.error ? { kind: "failed", error: result.error } : { kind: "paused" } }));
    setBusy(null);
  }

  function pauseAll() {
    start(async () => {
      for (const c of campaigns) if (states[c.id]?.kind !== "paused" && c.pausable !== false) await pauseOne(c.id);
    });
  }

  const remaining = campaigns.filter((c) => states[c.id]?.kind !== "paused");
  const dailyLeft = remaining.reduce((n, c) => n + c.dailyBudgetCents, 0);

  if (campaigns.length === 0) {
    return <p className="text-sm text-neutral-300">No MAIRO campaigns are running in Meta right now, so nothing keeps spending because of MAIRO.</p>;
  }

  return (
    <div className="space-y-4">
      <p role="status" className="text-sm text-neutral-200">
        {remaining.length === 0
          ? "All of them are paused, confirmed by Meta. Nothing MAIRO made is spending."
          : `${remaining.length} ${remaining.length === 1 ? "campaign is" : "campaigns are"} running — up to ${usd(dailyLeft)} a day in total, charged by Meta to your ad account.`}
      </p>
      <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
        {campaigns.map((c) => {
          const st = states[c.id] ?? { kind: "idle" };
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{c.name}</p>
                <p className="text-xs text-neutral-500">Up to {usd(c.dailyBudgetCents)} a day</p>
                {st.kind === "failed" && (
                  <p className="mt-1 text-xs text-red-300">
                    Meta didn&apos;t confirm the pause: {st.error}{" "}
                    <a href={ADS_MANAGER} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Pause it in Ads Manager</a>
                  </p>
                )}
              </div>
              {st.kind === "paused" ? (
                <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs text-emerald-300">Paused · confirmed by Meta</span>
              ) : canPause && c.pausable === false ? (
                <span className="text-xs text-neutral-400">Switch to this client to pause it</span>
              ) : canPause ? (
                <button
                  type="button"
                  onClick={() => start(() => pauseOne(c.id))}
                  disabled={busy !== null}
                  className="min-h-[36px] rounded-full border border-white/20 px-4 text-xs text-white transition hover:bg-white/10 disabled:opacity-50"
                >
                  {busy === c.id ? "Asking Meta…" : "Pause"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canPause && remaining.length > 1 && (
        <button
          type="button"
          onClick={pauseAll}
          disabled={busy !== null}
          className="min-h-[40px] rounded-full bg-white px-5 text-sm font-medium text-neutral-900 transition hover:bg-white/90 disabled:opacity-50"
        >
          Pause all {remaining.length}
        </button>
      )}
      {!canPause && (
        <p className="text-sm text-amber-200">
          MAIRO can&apos;t reach your Meta account right now, so it can&apos;t pause these for you.{" "}
          <a href={ADS_MANAGER} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Pause them in Meta Ads Manager</a>
          {" "}— or reconnect Meta first.
        </p>
      )}
      <p className="text-xs text-neutral-500">
        Only campaigns MAIRO made are listed. Campaigns you created yourself in Ads Manager aren&apos;t affected by
        anything here.
      </p>
    </div>
  );
}
