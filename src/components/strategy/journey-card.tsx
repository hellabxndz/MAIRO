import Link from "next/link";
import { dismissWelcomeAction } from "@/lib/actions/strategy-actions";

// The dashboard's first-campaign card. Before launch it points at the one
// thing left to do; after launch it welcomes them once and says plainly that
// MAIRO is still collecting data — nothing is shown that Meta hasn't reported.

export function FirstCampaignCard({ state }: { state: { launched: boolean; launchedAt: Date | null; welcomed: boolean; learning: boolean } }) {
  if (!state.launched) {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-violet/30 bg-violet/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[15px] font-semibold text-white">Your approved plan is waiting to become your first campaign</p>
          <p className="mt-1 text-[13px] text-muted">Connect your account, make the final creatives, and press Launch when you&rsquo;re happy. Nothing spends before that.</p>
        </div>
        <Link href="/dashboard/launch" className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg bg-[#7c5cff] px-5 text-[14px] font-medium text-white hover:brightness-110">
          Continue setup
        </Link>
      </div>
    );
  }
  if (state.welcomed && !state.learning) return null;
  return (
    <div className="mb-6 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          {!state.welcomed && <p className="text-[15px] font-semibold text-white">Welcome to your full MAIRO dashboard.</p>}
          <p className={state.welcomed ? "text-[14px] font-medium text-white" : "mt-1 text-[13.5px] text-white/90"}>
            Your first campaign is live. MAIRO is now monitoring performance.
          </p>
          {state.learning && (
            <p className="mt-1 text-[12.5px] text-muted">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 align-middle" />
              Collecting data — MAIRO is learning from your campaign. Numbers fill in as Meta reports them, usually within a few hours; anything empty below is waiting on real results, not hidden.
            </p>
          )}
        </div>
        {!state.welcomed && (
          <form action={dismissWelcomeAction}>
            <button type="submit" className="shrink-0 text-[12.5px] text-faint hover:text-white">Dismiss</button>
          </form>
        )}
      </div>
    </div>
  );
}
