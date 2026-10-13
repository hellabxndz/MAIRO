"use client";

import { useState } from "react";
import { useWebsiteScan } from "./use-website-scan";
import { Coverage, FactsList, FindingCard, RecheckButton, ScanError, ScanForm, ScanProgressView } from "./website-report";
import { CopyButton, NextStep, ResultPanel } from "./ui";

export function LandingPageAuditTool() {
  const { state, run } = useWebsiteScan();
  const [last, setLast] = useState<{ url: string; ad?: string } | null>(null);
  const [resolved, setResolved] = useState<string[]>([]);
  const result = state.phase === "done" ? state.result : null;
  const ok = result && (result.status === "OK" || result.status === "PARTIAL");
  const rest = ok ? result.audit.findings.filter((f) => !result.audit.top.some((t) => t.key === f.key)) : [];
  const text = ok
    ? [`Before you spend on ads — ${result.finalUrl}`, ...result.audit.top.map((f, i) => `${i + 1}. ${f.title}. ${f.evidence ?? ""} → ${f.change}`)].join("\n")
    : "";
  return (
    <div className="space-y-5">
      <ScanForm state={state} withAdMessage onScan={(url, ad) => { setLast({ url, ad }); setResolved([]); void run({ url, adMessage: ad }); }} />
      {state.phase === "running" && <ScanProgressView progress={state.progress} />}
      {state.phase === "error" && <ScanError message={state.message} />}
      {result && !ok && <ScanError message={result.error ?? "MAIRO couldn't read that page."} />}
      {ok && (
        <>
          <ResultPanel title={result.audit.top.length ? "The three changes that matter most" : "Nothing urgent found"}>
            {result.audit.top.length ? (
              <ol className="space-y-3">
                {result.audit.top.map((f) => <FindingCard key={f.key} f={f} resolved={resolved.includes(f.key)} onResolve={(r) => setResolved((x) => (r ? [...x, f.key] : x.filter((k) => k !== f.key)))} />)}
              </ol>
            ) : (
              <p className="text-[14px] text-white/80">MAIRO didn&rsquo;t find a problem it could see. The full list below includes what it couldn&rsquo;t check.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {last && <RecheckButton busy={false} onClick={() => void run({ url: last.url, adMessage: last.ad, recheck: true })} />}
              {text && <CopyButton text={text} label="Copy the top three" />}
            </div>
            <p className="mt-2 text-[12px] text-white/50">&ldquo;Mark resolved&rdquo; is kept on this page only. Recheck reads the page again to confirm. MAIRO can&rsquo;t change your website — a web address doesn&rsquo;t give access to edit it — so every change is yours to make.</p>
          </ResultPanel>
          <section aria-labelledby="all-findings">
            <h2 id="all-findings" className="text-[18px] font-semibold text-white">The full report</h2>
            <ul className="mt-3 space-y-3">
              {rest.map((f) => (f.status === "ok" ? (
                <li key={f.key} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-[13.5px] text-white/80"><span className="mr-2 text-emerald-300">✓</span>{f.title}{f.evidence ? <span className="text-white/50"> — {f.evidence}</span> : null}</li>
              ) : (
                <FindingCard key={f.key} f={f} compact resolved={resolved.includes(f.key)} onResolve={f.status === "issue" ? (r) => setResolved((x) => (r ? [...x, f.key] : x.filter((k) => k !== f.key))) : undefined} />
              )))}
            </ul>
          </section>
          <section aria-labelledby="facts">
            <h2 id="facts" className="text-[18px] font-semibold text-white">What MAIRO found about the business</h2>
            <p className="mt-1 text-[13px] text-white/60">Only what&rsquo;s on the pages. You can correct any of it when you set up your plan.</p>
            <div className="mt-3"><FactsList result={result} /></div>
          </section>
          <Coverage result={result} cached={state.phase === "done" && state.cached} />
          <NextStep title="Plan ads for this page" body="Continue with this website: your free MAIRO plan starts from what was found here, and you confirm or correct each fact." action="Continue with this website" handoff={{ kind: "website", tool: "landing-page-audit", url: result.finalUrl ?? result.requestedUrl }} />
        </>
      )}
    </div>
  );
}
