"use client";

import { useState } from "react";
import type { ScanResult } from "@/lib/website/scan";
import { useWebsiteScan } from "./use-website-scan";
import { ScanError, ScanProgressView } from "./website-report";
import { CopyButton, NextStep, Panel, ResultPanel, inputCls, primaryBtn } from "./ui";

const ROWS: [string, (r: ScanResult) => string][] = [
  ["Headline", (r) => r.pages[0]?.h1 ?? "None found"],
  ["Main button", (r) => r.pages[0]?.ctas[0] ?? (r.destinations.phoneLinks[0] ? "Phone link" : "None found")],
  ["Offers shown", (r) => r.offers.join(" · ") || "None found"],
  ["Prices shown", (r) => [...new Set(r.pages.flatMap((p) => p.prices))].slice(0, 4).join(", ") || "None found"],
  ["Where they work", (r) => (r.business.areaServed.length ? r.business.areaServed.join(", ") : r.business.locality ?? r.serviceArea[0] ?? "Not stated")],
  ["Proof shown", (r) => (r.business.rating ? `Rating in page data: ${r.business.rating.value} (${r.business.rating.count})` : r.trust[0] ?? (r.apps.some((a) => a.category === "Reviews") ? "A review widget" : "None found"))],
  ["How to buy or book", (r) => [r.destinations.cart && "Cart", r.destinations.booking[0]?.provider, r.destinations.forms.length && "Form", r.destinations.phoneLinks.length && "Phone"].filter(Boolean).join(", ") || "None found"],
  ["Products listed", (r) => r.facts.find((f) => f.field === "products")?.value ?? "None in page data"],
  ["Brand colours", (r) => r.colors.slice(0, 3).join(", ") || "None declared"],
  ["Built with", (r) => r.platform?.name ?? "Unknown"],
];

export function CompetitorWebsiteTool() {
  const { state, run } = useWebsiteScan();
  const [urls, setUrls] = useState(["", "", ""]);
  const [results, setResults] = useState<(ScanResult | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const filled = urls.map((u) => u.trim()).filter(Boolean);
  const go = async () => {
    setBusy(true);
    const out: (ScanResult | null)[] = [];
    for (const u of filled) out.push(await run({ url: u }));
    setResults(out);
    setBusy(false);
  };
  const ok = results.filter((r): r is ScanResult => Boolean(r && (r.status === "OK" || r.status === "PARTIAL")));
  const text = ok.length ? ROWS.map(([label, f]) => `${label}: ${ok.map((r) => `${new URL(r.finalUrl ?? r.requestedUrl).hostname} — ${f(r)}`).join(" | ")}`).join("\n") : "";
  return (
    <div className="space-y-5">
      <Panel>
        <p className="text-[15px] font-semibold text-white">Up to three websites</p>
        <p className="mt-1 text-[13px] text-white/60">Yours first, then competitors. Each counts as one free check.</p>
        <div className="mt-3 grid gap-3">
          {urls.map((u, i) => (
            <div key={i}>
              <label htmlFor={`cw-${i}`} className="block text-[13px] text-white/80">{i === 0 ? "Your website" : `Competitor ${i}`}</label>
              <input id={`cw-${i}`} value={u} onChange={(e) => setUrls((x) => x.map((y, j) => (j === i ? e.target.value : y)))} className={`${inputCls} mt-1`} inputMode="url" maxLength={300} placeholder={i === 0 ? "yourbusiness.com" : "competitor.com"} />
            </div>
          ))}
        </div>
        <button type="button" className={`${primaryBtn} mt-4`} disabled={busy || filled.length < 2} onClick={() => void go()}>{busy ? "Reading…" : "Compare"}</button>
      </Panel>
      {state.phase === "running" && <ScanProgressView progress={state.progress} />}
      {results.map((r, i) => (r && r.status !== "OK" && r.status !== "PARTIAL" ? <ScanError key={i} message={`${filled[i]}: ${r.error}`} /> : null))}
      {state.phase === "error" && <ScanError message={state.message} />}
      {ok.length >= 1 && !busy && (
        <ResultPanel title="Side by side — only what's on the public pages">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-[13px]">
              <thead><tr className="text-white/60"><th className="py-2 pr-3 font-medium" />{ok.map((r) => <th key={r.requestedUrl} className="py-2 pr-3 font-medium text-white">{new URL(r.finalUrl ?? r.requestedUrl).hostname}</th>)}</tr></thead>
              <tbody className="align-top text-white/85">
                {ROWS.map(([label, f]) => (
                  <tr key={label} className="border-t border-white/[0.06]"><th scope="row" className="py-2 pr-3 font-normal text-white/55">{label}</th>{ok.map((r) => <td key={r.requestedUrl} className="py-2 pr-3">{f(r)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-white/55">No traffic, revenue, sales rankings or ad spend: none of that is visible on a website, and MAIRO doesn&rsquo;t estimate it. Read {ok.length} site{ok.length === 1 ? "" : "s"} at {new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.</p>
          <div className="mt-3"><CopyButton text={text} label="Copy the comparison" /></div>
        </ResultPanel>
      )}
      {ok.length >= 2 && !busy && (
        <NextStep title="Stand out where they're the same" body="Your free MAIRO plan writes three creative directions for your business — built on what's true about you, not copied from them." action="Continue with my website" handoff={{ kind: "website", tool: "competitor-website", url: ok[0].finalUrl ?? ok[0].requestedUrl }} />
      )}
    </div>
  );
}
