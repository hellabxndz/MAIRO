"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelPlanLaunchAction, launchPlanCampaignAction } from "@/lib/actions/strategy-actions";
import type { Problem } from "@/lib/onboarding/problems";
import { ProblemCard } from "@/components/onboarding/problem-card";

// "Approve and launch": the only thing that lets the first campaign spend.
// The budget, who charges it and the separate MAIRO subscription are stated
// and agreed to first. One press records the approval; a second press can't
// do it twice. "Live" is said only after Meta confirmed it.

export function LaunchPanel({
  name,
  budget,
  per30,
  adAccount,
  subscription,
  ready,
  campaignHref,
}: {
  name: string;
  budget: string;
  per30: string | null;
  adAccount: string | null;
  subscription: string;
  ready: boolean;
  campaignHref: string;
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const [done, setDone] = useState<{ live: boolean; message: string | null } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<string | null>(null);

  function launch() {
    if (!agreed || busy.current) return;
    busy.current = true;
    setError(null);
    setProblem(null);
    start(async () => {
      const r = await launchPlanCampaignAction().catch(() => ({ ok: false as const, error: "MAIRO couldn't reach the server. Nothing was launched or charged — try again." }));
      busy.current = false;
      if (!r.ok) {
        setError(r.error);
        return;
      }
      if (r.problem) {
        setProblem(r.problem);
        return;
      }
      setDone({ live: r.live, message: r.message });
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="launch-confirm" className="rounded-2xl border-2 border-violet/50 bg-violet/[0.06] p-5 sm:p-6">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Final approval</p>
      <h2 id="launch-confirm" className="mt-1 text-[20px] font-semibold text-white">Ready to launch &ldquo;{name}&rdquo;?</h2>
      <dl className="mt-3 grid grid-cols-1 gap-2 text-[13.5px] sm:grid-cols-2">
        <div><dt className="text-faint">Ad budget, charged by Meta</dt><dd className="text-white">{budget}{per30 ? ` — about ${per30} every 30 days` : ""}{adAccount ? ` · ${adAccount}` : ""}</dd></div>
        <div><dt className="text-faint">MAIRO subscription, separate</dt><dd className="text-white">{subscription}</dd></div>
      </dl>

      {done ? (
        <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-[14px] ${done.live ? "border border-emerald-400/30 bg-emerald-400/[0.06] text-white" : "bg-white/[0.04] text-white/90"}`}>
          {done.live ? done.message ?? `Meta confirmed “${name}” is live. MAIRO is now watching how it does.` : done.message}
        </p>
      ) : (
        <>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/15 bg-paper/60 p-4">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#7c5cff]" />
            <span className="text-[14px] leading-relaxed text-white/90">
              I approve this campaign and agree to spend up to {budget}{per30 ? ` (about ${per30} every 30 days)` : ""}, charged by Meta to my ad account. I can pause it at any time.
            </span>
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={launch}
              disabled={!agreed || pending || !ready}
              className="min-h-[52px] rounded-xl bg-[#7c5cff] px-8 text-[16px] font-semibold text-white shadow-[var(--mairo-glow-key)] hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Approving…" : "Approve and launch"}
            </button>
            <Link href={campaignHref} className="inline-flex min-h-[48px] items-center rounded-xl border border-white/12 px-5 text-[14px] text-white/85 hover:border-white/30">
              Change something first
            </Link>
            <Link href="/dashboard/agents" className="inline-flex min-h-[48px] items-center rounded-xl border border-white/12 px-5 text-[14px] text-white/85 hover:border-white/30">
              Ask MAIRO
            </Link>
          </div>
          {!ready && <p className="mt-3 text-[12.5px] text-amber-200">Fix what&rsquo;s marked above first — it can&rsquo;t run until then.</p>}
          <p className="mt-3 text-[12.5px] text-muted">After you approve, MAIRO switches it on once Meta has approved the ad and confirmed it can charge your ad account. MAIRO says it&rsquo;s live only when Meta confirms.</p>
        </>
      )}
      {problem && <ProblemCard problem={problem} className="mt-4" />}
      {error && <p role="alert" className="mt-4 rounded-lg bg-alert/10 px-4 py-3 text-[13.5px] text-alert">{error}</p>}
    </section>
  );
}

/** Takes back the approval before it goes live. The campaign stays built and switched off. */
export function CancelLaunch() {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  if (result) {
    return <p role="status" className={`rounded-xl px-4 py-3 text-[13.5px] ${result.ok ? "bg-white/[0.04] text-white/90" : "bg-alert/10 text-alert"}`}>{result.text}</p>;
  }
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="text-[13px] text-muted underline underline-offset-4 hover:text-white">
        Changed your mind? Cancel the launch
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-white/12 p-4">
      <p className="text-[13.5px] text-white">Cancel the launch? The campaign stays switched off in your ad account and nothing is spent.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await cancelPlanLaunchAction().catch(() => ({ ok: false as const, error: "MAIRO couldn't reach the server. Try again." }));
              setResult(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
              router.refresh();
            })
          }
          className="min-h-[42px] rounded-lg border border-alert/40 px-4 text-[13.5px] text-white hover:bg-alert/10 disabled:opacity-50"
        >
          {pending ? "Cancelling…" : "Yes, cancel the launch"}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="min-h-[42px] rounded-lg px-4 text-[13.5px] text-muted hover:text-white">
          Keep it
        </button>
      </div>
    </div>
  );
}
