"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ExperimentView } from "@/lib/experiments/store";
import { EVIDENCE } from "@/lib/experiments/verdict";
import { approveExperimentAction, buildExperimentCampaignAction, cancelExperimentAction, checkExperimentAction } from "@/lib/actions/experiment-actions";

// "Your first test": the proposed test between two approved directions, and
// everything after — the owner's approval, the campaign draft, the daily
// figures from Meta and the verdict. Each state says what happens next and
// who does it. Figures are Meta's per-ad results since the test started;
// before there are any, none are shown.

const STEPS: { key: ExperimentView["status"]; label: string }[] = [
  { key: "PROPOSED", label: "Proposed" },
  { key: "APPROVED", label: "Approved" },
  { key: "RUNNING", label: "Running" },
  { key: "CONCLUDED", label: "Result" },
];

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const primary = "inline-flex min-h-[40px] items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] px-4 text-[13px] font-semibold text-[#fff] disabled:opacity-60";
const quiet = "inline-flex min-h-[40px] items-center justify-center rounded-full border px-4 text-[13px] text-white/85 hover:text-white disabled:opacity-60";

export function ExperimentPanel({ test, approved, paid }: { test: ExperimentView | null; approved: number; paid: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: true; href?: string } | { ok: false; error: string }>, success?: string) =>
    start(async () => {
      setNotice(null);
      const r = await fn();
      if (!r.ok) return setNotice(r.error);
      if ("href" in r && r.href) return router.push(r.href);
      if (success) setNotice(success);
      router.refresh();
    });

  if (!test || test.status === "CANCELED") {
    return (
      <section aria-labelledby="test-h" className="mt-10 rounded-[var(--radius-panel)] border px-6 py-5" style={{ borderColor: "var(--mairo-line)" }}>
        <h2 id="test-h" className="text-[16px] font-semibold text-white">Your first test</h2>
        {test?.conclusion && <p className="mt-2 text-[13px] text-white/80">{test.conclusion}</p>}
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {approved === 1 ? "One direction approved. " : ""}Approve two directions and MAIRO proposes a fair test between them: the same picture, budget and audience, with only the words different. You decide whether it runs.
        </p>
      </section>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.key === test.status);
  const result = test.result;
  const verdict = result?.verdict ?? null;

  return (
    <section aria-labelledby="test-h" className="mt-10 rounded-[var(--radius-panel)] border px-6 py-5" style={{ borderColor: "var(--mairo-line)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="test-h" className="text-[16px] font-semibold text-white">Your first test</h2>
          <p className="mt-1 text-[13.5px] text-white/85">{test.hypothesis}</p>
        </div>
        <ol aria-label="Test progress" className="flex flex-wrap gap-1.5">
          {STEPS.map((s, i) => (
            <li key={s.key} aria-current={i === stepIndex ? "step" : undefined} className={`rounded-full px-2.5 py-1 text-[11.5px] ${i < stepIndex ? "bg-live/15 text-live" : i === stepIndex ? "bg-violet/20 text-white" : "bg-white/[0.05] text-muted"}`}>
              {i < stepIndex ? "✓ " : ""}{s.label}
            </li>
          ))}
        </ol>
      </div>

      {/* The two versions, with their figures once Meta has some. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {test.variants.map((v, i) => {
          const f = result?.figures[i];
          const winner = verdict?.kind === "winner" && verdict.winner === i;
          return (
            <div key={`${v.label}-${i}`} className={`min-w-0 rounded-2xl border px-4 py-3 ${winner ? "border-live/50" : ""}`} style={winner ? undefined : { borderColor: "var(--mairo-line)" }}>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                Version {String.fromCharCode(65 + i)}
                {winner && <span className="rounded-full bg-live/15 px-2 py-0.5 text-[10.5px] normal-case tracking-normal text-live">Better per {result!.word}</span>}
              </p>
              <p className="mt-1 text-[14px] font-semibold text-white">{v.label}</p>
              {v.primaryText && <p className="mt-1 line-clamp-2 text-[12.5px] text-white/70">{v.primaryText}</p>}
              {f && (
                <dl className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                  <div><dt className="text-muted">Spent</dt><dd className="font-semibold text-white tabular-nums">{usd(f.spendCents)}</dd></div>
                  <div><dt className="text-muted">{cap(result!.word)}s</dt><dd className="font-semibold text-white tabular-nums">{f.results}</dd></div>
                  <div><dt className="text-muted">Each</dt><dd className="font-semibold text-white tabular-nums">{f.results > 0 ? usd(Math.round(f.spendCents / f.results)) : "—"}</dd></div>
                </dl>
              )}
            </div>
          );
        })}
      </div>
      {result && <p className="mt-2 text-[11.5px] text-muted">Meta&rsquo;s figures for each ad since the test started ({result.days} {result.days === 1 ? "day" : "days"}), last read {new Date(result.checkedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.</p>}

      {/* What happens now. */}
      <div className="mt-4 rounded-2xl bg-white/[0.03] px-4 py-3">
        {test.status === "PROPOSED" && (
          <>
            <p className="text-[13.5px] text-white/90">MAIRO wrote this test down; it isn&rsquo;t running. Approve it and MAIRO makes a campaign draft with both versions on the same picture. You check the budget and launch it in the campaign builder as usual.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={pending} className={primary} onClick={() => run(() => approveExperimentAction(test.id), "Test approved. Next, build its campaign.")}>Approve this test</button>
              <button type="button" disabled={pending} className={quiet} style={{ borderColor: "var(--mairo-line)" }} onClick={() => run(() => cancelExperimentAction(test.id))}>Not now</button>
            </div>
          </>
        )}
        {test.status === "APPROVED" && !test.mairoCampaignId && (
          <>
            <p className="text-[13.5px] text-white/90">Approved. Next: the test&rsquo;s campaign — both versions as separate ads in one campaign, so they share the budget and audience. Nothing is built in your ad account until you launch it.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={pending || !paid} className={primary} onClick={() => run(() => buildExperimentCampaignAction(test.id))}>{test.campaignDraftId ? "Open the test campaign" : "Build the test campaign"}</button>
              <button type="button" disabled={pending} className={quiet} style={{ borderColor: "var(--mairo-line)" }} onClick={() => run(() => cancelExperimentAction(test.id))}>Stop the test</button>
            </div>
            {!paid && <p className="mt-2 text-[12px] text-muted">Running campaigns needs an active subscription. <Link href="/plan/activate" className="underline underline-offset-4">See plans</Link></p>}
          </>
        )}
        {test.status === "APPROVED" && test.mairoCampaignId && (
          <p className="text-[13.5px] text-white/90">The test&rsquo;s campaign is built. The test starts when Meta reports it running — after Meta approves the ads and you&rsquo;ve approved the launch. <Link href={`/dashboard/campaigns/${test.mairoCampaignId}`} className="text-violet-bright underline-offset-4 hover:underline">Open the campaign</Link></p>
        )}
        {test.status === "RUNNING" && (
          <>
            <p className="text-[13.5px] font-semibold text-white">{verdict?.headline ?? "Collecting evidence"}</p>
            {verdict && !verdict.final && verdict.missing.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-white/75">{verdict.missing.map((m) => <li key={m}>· Needs {m}</li>)}</ul>
            )}
            {!result && <p className="mt-1 text-[12.5px] text-white/75">MAIRO reads each ad&rsquo;s results from Meta every day and says when there&rsquo;s enough to call it.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={pending} className={quiet} style={{ borderColor: "var(--mairo-line)" }} onClick={() => run(() => checkExperimentAction(test.id), "Figures updated from Meta.")}>{pending ? "Reading Meta…" : "Check now"}</button>
              <button type="button" disabled={pending} className={quiet} style={{ borderColor: "var(--mairo-line)" }} onClick={() => run(() => cancelExperimentAction(test.id))}>Stop the test</button>
            </div>
          </>
        )}
        {test.status === "CONCLUDED" && verdict && verdict.final && (
          <>
            <p className="text-[13.5px] font-semibold text-white">{verdict.headline}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/80">{verdict.detail}</p>
            {verdict.kind === "winner" && (
              <p className="mt-2 text-[12.5px] text-white/80">
                MAIRO proposes switching off the other version so the budget goes to the winner. Nothing changes until you approve it.{" "}
                <Link href="/dashboard/decisions" className="text-violet-bright underline-offset-4 hover:underline">Review the proposal</Link>
              </p>
            )}
          </>
        )}
      </div>

      <details className="mt-3 text-[12.5px] text-muted">
        <summary className="cursor-pointer text-white/80">How MAIRO decides</summary>
        <ul className="mt-2 space-y-1 leading-relaxed">
          <li>· At least {EVIDENCE.minDays} days of running, and at least {EVIDENCE.minResultsTotal} results across both versions ({EVIDENCE.minResultsLeader} for the leader).</li>
          <li>· Compared by cost per result, allowing for Meta giving one ad more of the budget than the other.</li>
          <li>· A version is called better only when chance is an unlikely explanation for the gap (less than 1 in 20). Within {Math.round(EVIDENCE.sameWithin * 100)}% of each other counts as no difference.</li>
          <li>· An ad that got less than {Math.round(EVIDENCE.minSpendShare * 100)}% of the money wasn&rsquo;t really tested, and MAIRO says so instead of naming a loser.</li>
          <li>· After {EVIDENCE.maxDays} days without a clear answer, the test ends and says it couldn&rsquo;t tell.</li>
          <li>· A test is a fair comparison of two versions, not a promise that either will work.</li>
        </ul>
      </details>
      {notice && <p role="status" className="mt-2 text-[12.5px] text-white/80">{notice}</p>}
    </section>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
