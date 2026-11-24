"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Action, Analysis, Confidence, Finding, Recommendation } from "@/lib/analyzer/analyze";
import { OPEN_ASSISTANT_EVENT } from "@/components/mairo/assistant";

// The first five minutes after connecting Meta: the steps MAIRO is really
// doing (each ticked when its work finishes — streamed from /api/analyzer),
// then MAIRO speaking to the owner: what's working, what could be better,
// what it recommends — every point with its evidence, how sure MAIRO is and
// what could make it wrong — and one tap to act on each.

type Step = { key: string; label: string; state: "waiting" | "working" | "done"; detail?: string };
const STEP_LABELS: [string, string][] = [
  ["connect", "Connecting to your advertising account"],
  ["campaigns", "Reviewing your previous campaigns"],
  ["performance", "Analyzing your advertising performance"],
  ["opportunities", "Identifying growth opportunities"],
  ["strategy", "Preparing your personalized strategy"],
];
const CONF: Record<Confidence, string> = { high: "High confidence", medium: "Medium confidence", low: "Early signal" };
const usd = (c: number | null) => (c === null ? "—" : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: c >= 100_000 ? 0 : 2, minimumFractionDigits: c >= 100_000 ? 0 : 2 })}`);

export type ActionLinks = Record<Exclude<Action, "explain">, { href: string; label: string }>;

export function AnalyzerView({ actions, adsManager }: { actions: ActionLinks; adsManager: string | null }) {
  const [steps, setSteps] = useState<Step[]>(STEP_LABELS.map(([key, label]) => ({ key, label, state: "waiting" })));
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSteps(STEP_LABELS.map(([key, label]) => ({ key, label, state: "waiting" })));
      setAnalysis(null);
      setError(null);
      try {
        const res = await fetch("/api/analyzer", { cache: "no-store" });
        if (!res.body || (!res.ok && res.headers.get("content-type")?.includes("json"))) {
          const j = await res.json().catch(() => null);
          if (!cancelled) setError(j?.message ?? "MAIRO couldn't analyze your account just now. Nothing was changed.");
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done || cancelled) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (!line.trim()) continue;
            const m = JSON.parse(line);
            if (m.type === "progress") setSteps((s) => s.map((x) => (x.key === m.step ? { ...x, state: m.state, detail: m.detail ?? x.detail } : x)));
            if (m.type === "result") setAnalysis(m.analysis);
            if (m.type === "error") setError(m.message);
          }
        }
      } catch {
        if (!cancelled) setError("MAIRO couldn't reach your account just now. Nothing was changed. Try again in a minute.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [run]);

  useEffect(() => {
    if (analysis) heading.current?.focus();
  }, [analysis]);

  const explain = (r: Recommendation | Finding) => {
    window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: { prompt: `Explain this from my ads analysis: "${r.title}". What's the evidence, and what would you do?` } }));
  };

  if (!analysis) {
    return (
      <section aria-labelledby="analyzing" className="mx-auto max-w-[640px]" data-analyzer="running">
        <p className="v3-label">Meta Ads Analyzer</p>
        <h1 id="analyzing" className="mt-3 text-[clamp(28px,4vw,40px)] font-semibold tracking-[-0.03em] text-white">MAIRO is reading your ad account</h1>
        <ol className="mt-8 space-y-4" aria-live="polite">
          {steps.map((s) => (
            <li key={s.key} className="flex items-start gap-3" data-step={s.key} data-state={s.state}>
              <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[12px] ${s.state === "done" ? "border-white/50 bg-white text-black" : s.state === "working" ? "border-white/60 text-white" : "border-white/15 text-white/30"}`}>
                {s.state === "done" ? "✓" : s.state === "working" ? <span className="v3-dot v3-breathe" /> : ""}
              </span>
              <span>
                <span className={`block text-[15.5px] ${s.state === "waiting" ? "text-white/45" : "text-white"}`}>{s.label}</span>
                {s.detail && <span className="block text-[13px] text-white/55">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
        {error && (
          <div role="alert" className="mt-8 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-4 text-[14.5px] text-amber-100">
            {error}
            <button type="button" onClick={() => setRun((n) => n + 1)} className="mt-3 block min-h-11 rounded-full bg-white px-5 text-[14px] font-semibold text-black">Try again</button>
          </div>
        )}
        <p className="mt-8 text-[13px] text-white/50">Read-only: MAIRO doesn&rsquo;t change, pause or spend anything in your account while it analyzes.</p>
      </section>
    );
  }

  if (analysis.state === "no-history") {
    return (
      <section className="mx-auto max-w-[640px]" data-analyzer="no-history">
        <p className="v3-label">Meta Ads Analyzer</p>
        <h1 ref={heading} tabIndex={-1} className="mt-3 text-[clamp(28px,4vw,40px)] font-semibold tracking-[-0.03em] text-white outline-none">A fresh start</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-white/80">{analysis.headline}</p>
        <Link href={actions.build.href} className="mt-6 inline-flex min-h-12 items-center rounded-full bg-white px-6 text-[15px] font-semibold text-black">{actions.build.label}</Link>
      </section>
    );
  }

  const a = analysis;
  const go = (r: Recommendation) => (r.action === "explain" ? null : actions[r.action]);
  return (
    <article aria-labelledby="analysis-title" className="mx-auto max-w-[960px]" data-analyzer="ready">
      <p className="v3-label">Your ads, analyzed by MAIRO</p>
      <h1 id="analysis-title" ref={heading} tabIndex={-1} className="mt-3 max-w-[820px] text-[clamp(24px,3.4vw,36px)] font-semibold leading-snug tracking-[-0.02em] text-white outline-none">
        {a.headline}
      </h1>
      <p className="mt-3 text-[13px] text-white/55">
        From Meta&rsquo;s figures for {a.basis.existing} campaign{a.basis.existing === 1 ? "" : "s"} already on your account{a.basis.managed ? ` and ${a.basis.managed} run by MAIRO` : ""}. Nothing was changed.
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {a.windows.filter((w) => w.key !== "prev30").map((w) => (
          <div key={w.key} className="rounded-[18px] border border-[color:var(--v3-line)] p-4">
            <dt className="text-[12.5px] text-white/55">{w.label}</dt>
            <dd className="mt-1 text-[20px] font-semibold tabular-nums text-white">{usd(w.spendCents)}</dd>
            <dd className="text-[13px] text-white/70">{w.results === null ? "Results not reported" : `${w.results.toLocaleString("en-US")} ${w.resultWord}${w.results === 1 ? "" : "s"}${w.costPerResultCents ? ` · ${usd(w.costPerResultCents)} each` : ""}`}</dd>
            {w.roas !== null && <dd className="text-[13px] text-white/70">ROAS {w.roas.toFixed(2)}×</dd>}
          </div>
        ))}
      </dl>

      <Group title="What you're doing well" empty="Nothing stands out as clearly better than your account's average yet." items={a.doingWell} onExplain={explain} />
      <Group title="What could be improved" empty="Nothing looks wasted or out of line over this period." items={a.improve} onExplain={explain} tone="warn" />

      <section aria-labelledby="recs" className="mt-10">
        <h2 id="recs" className="text-[18px] font-semibold text-white">What MAIRO recommends</h2>
        <ul className="mt-4 space-y-3">
          {a.recommendations.map((r) => {
            const link = go(r);
            return (
              <li key={r.key} className="rounded-[20px] border border-[color:var(--v3-line)] p-5" data-rec={r.action}>
                <p className="text-[16px] font-medium text-white">{r.title}</p>
                <p className="mt-1 text-[14.5px] leading-relaxed text-white/75">{r.why}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-white/60">{r.expected}</p>
                <p className="mt-2 text-[12.5px] text-white/50">{CONF[r.confidence]} · not a guarantee of results</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {link && (
                    <Link href={link.href} className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-black">
                      {link.label}
                    </Link>
                  )}
                  {(r.action === "fix" || r.action === "budget") && adsManager && r.campaignId && (
                    <a href={`${adsManager}&selected_campaign_ids=${encodeURIComponent(r.campaignId)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--v3-line-strong)] px-5 text-[14px] text-white/90">
                      Open in Ads Manager
                    </a>
                  )}
                  <button type="button" onClick={() => explain(r)} className="inline-flex min-h-11 items-center rounded-full border border-[color:var(--v3-line-strong)] px-5 text-[14px] text-white/90">
                    Explain this recommendation
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[13px] text-white/55">MAIRO never changes a campaign it didn&rsquo;t build, and nothing it builds spends until you approve it. Campaigns that are working are kept, not replaced.</p>
      </section>

      <details className="mt-10 rounded-[20px] border border-[color:var(--v3-line)] p-5">
        <summary className="min-h-11 cursor-pointer text-[15px] font-medium text-white">Every campaign, {a.basis.window === "d90" ? "last 90 days" : "last 180 days"}</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[13.5px]">
            <thead className="text-white/50">
              <tr><th className="py-2 font-normal">Campaign</th><th className="py-2 text-right font-normal">Spent</th><th className="py-2 text-right font-normal">Results</th><th className="py-2 text-right font-normal">Per result</th><th className="py-2 text-right font-normal">ROAS</th><th className="py-2 text-right font-normal">Seen per person</th></tr>
            </thead>
            <tbody>
              {a.campaigns.map((c) => (
                <tr key={c.id} className="border-t border-[color:var(--v3-line)] text-white/85">
                  <td className="max-w-[220px] truncate py-2">{c.name}{c.managed ? <span className="ml-2 text-[11px] text-white/45">MAIRO</span> : null}{c.running ? null : <span className="ml-2 text-[11px] text-white/45">not running</span>}</td>
                  <td className="py-2 text-right tabular-nums">{usd(c.spendCents)}</td>
                  <td className="py-2 text-right tabular-nums">{c.results ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">{usd(c.costPerResultCents)}</td>
                  <td className="py-2 text-right tabular-nums">{c.roas ? `${c.roas.toFixed(2)}×` : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{c.frequency ? c.frequency.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section aria-label="Limitations" className="mt-6 text-[13px] leading-relaxed text-white/55">
        <p className="font-medium text-white/70">What this analysis can&rsquo;t see</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">{a.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="mt-2">&ldquo;—&rdquo; means Meta didn&rsquo;t report it, not zero.</p>
      </section>
    </article>
  );
}

function Group({ title, empty, items, onExplain, tone }: { title: string; empty: string; items: Finding[]; onExplain: (f: Finding) => void; tone?: "warn" }) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] font-semibold text-white">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-[14.5px] text-white/60">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((f) => (
            <li key={f.key} className="rounded-[20px] border border-[color:var(--v3-line)] p-5" data-finding={f.key}>
              <p className="flex items-start gap-2 text-[16px] font-medium text-white">
                <span aria-hidden className={`mt-[9px] shrink-0 ${tone === "warn" ? "h-[7px] w-[7px] rounded-full bg-amber-300" : "v3-dot"}`} />
                {f.title}
              </p>
              <p className="mt-1 text-[14.5px] leading-relaxed text-white/75">{f.detail}</p>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                {f.evidence.map(([k, v]) => (
                  <div key={k} className="flex gap-1.5"><dt className="text-white/50">{k}</dt><dd className="tabular-nums text-white/90">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-2 text-[12.5px] text-white/50">{CONF[f.confidence]}{f.limitation ? ` · ${f.limitation}` : ""}</p>
              <button type="button" onClick={() => onExplain(f)} className="mt-2 inline-flex min-h-11 items-center text-[13.5px] text-white/80 underline decoration-white/30 underline-offset-4 sm:min-h-0">Explain this</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
